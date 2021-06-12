import { FileStore } from '../file-store';
import { readFileSync } from 'fs';
import path, { join } from 'path';
import JSZip, { JSZipObject } from 'jszip';
import { logger } from '@runejs/core';
import { fileExtensions, getIndexId, FileMetadata, IndexManifest, IndexName } from '../index-manifest';
import { IndexedFile } from './indexed-file';
import { IndexedFileGroup } from './indexed-file-group';
import { ByteBuffer } from '@runejs/core/buffer';
import { hash } from '../../client-store';
import * as CRC32 from 'crc-32';
import fs from 'fs';
import { createHash } from 'crypto';


export class IndexedArchive {

    public files: { [key: number]: IndexedFile } = {};
    public archiveData: ByteBuffer | null = null;

    private readonly fileStore: FileStore;
    private indexId: number;
    private indexName: IndexName;
    private loaded: boolean = false;
    private _manifest: IndexManifest;

    public constructor(fileStore: FileStore, indexId: number, indexName?: string) {
        this.fileStore = fileStore;
        this.indexId = indexId;
        if(indexName) {
            this.indexName = indexName as IndexName;
        }
    }

    public newFileIndex(): number {
        const currentIndexes: number[] = Object.keys(this.files).map(indexStr => parseInt(indexStr, 10));
        return Math.max(...currentIndexes) + 1;
    }

    public async indexArchiveFiles(): Promise<void> {
        await this.unpack(false);

        const storeZip = await this.loadZip();

        if(!storeZip) {
            return;
        }

        logger.info(`Indexing ${this.filePath}...`);
        logger.info(`Original file count: ${Object.keys(this.files).length}`);

        const newManifest: IndexManifest = {
            indexId: this.indexId,
            name: this.indexName,
            fileCompression: this._manifest.fileCompression,
            fileExtension: this._manifest.fileExtension,
            format: this._manifest.format ?? undefined,
            version: this._manifest.version ?? undefined,
            settings: this._manifest.settings ?? undefined,
            files: {}
        };

        const originalFileIndex = (fileName: string, fileList: IndexedFile[]): number => {
            const originalFile = fileList.find(indexedFile => indexedFile.fullFileName === fileName);
            return originalFile?.fileId ?? -1;
        };

        const extension = this._manifest.fileExtension;
        const fileNames = Object.keys(storeZip.files).filter(fileName => {
            if(!fileName) {
                return false;
            }

            // Include file groups
            if(fileName.endsWith('/')) {
                return true;
            }

            // Exclude grouped files (for now)
            if(fileName.indexOf('/') !== -1) {
                return false;
            }

            return fileName.endsWith(extension);
        });

        const existingFileList: IndexedFile[] = Object.values(this.files);

        logger.info(`Found ${fileNames.length} files or file groups.`);

        for(let fileName of fileNames) {
            const zippedFile = storeZip.files[fileName];
            fileName = fileName.replace('/', '');
            const oldFileIndex: number = originalFileIndex(fileName, existingFileList);
            const oldFile: FileMetadata | null = oldFileIndex !== -1 ? this._manifest.files[oldFileIndex] ?? null : null;
            const fileIndex = oldFileIndex !== -1 ? oldFileIndex : this.newFileIndex();
            const hash = createHash('sha256');

            newManifest.files[fileIndex] = oldFile ? oldFile : {
                file: fileName,
                version: oldFile?.version ?? 0
            };

            const newFile = newManifest.files[fileIndex];

            if(!newFile.version) {
                newFile.version = 0;
            }

            let fileDigest: string = '';

            if(zippedFile.dir) {
                const folder = storeZip.folder(fileName);
                let folderFileNames = Object.keys(folder.files) ?? [];
                const folderFiles: { [key: string]: JSZipObject } = {};
                folderFileNames
                    .filter(groupedFileName => groupedFileName?.startsWith(fileName + '/') &&
                        groupedFileName?.endsWith(this._manifest.fileExtension))
                    .forEach(groupedFileName => folderFiles[groupedFileName] = folder.files[groupedFileName]);

                folderFileNames = Object.keys(folderFiles)
                    .map(folderFileName => folderFileName.replace(fileName + '/', ''));

                newManifest.files[fileIndex].children = folderFileNames;

                const indexedGroup = new IndexedFileGroup(this._manifest, fileIndex, folderFiles);
                const groupFile = await indexedGroup.pack();
                fileDigest = hash.update(groupFile).digest('hex');
                newFile.crc = CRC32.buf(groupFile);
            } else {
                const fileData = await zippedFile.async('nodebuffer');
                const indexedFile = new IndexedFile(this._manifest, fileIndex, new ByteBuffer(fileData));
                if(indexedFile.fileData) {
                    fileDigest = hash.update(indexedFile.fileData).digest('hex');
                    newFile.crc = CRC32.buf(indexedFile.fileData);
                }
            }

            if(fileDigest) {
                newFile.sha256 = fileDigest;
            }

            if(oldFile) {
                // Update the file's version number if it already existed and has changed
                if(oldFile.sha256 !== fileDigest) {
                    newFile.version++;
                }
            }
        }

        this._manifest = newManifest;

        const indexData = await this.compressIndexData();
        this._manifest.crc = CRC32.buf(indexData);
        this._manifest.sha256 = createHash('sha256').update(indexData).digest('hex');

        storeZip.file(`.manifest.json`, JSON.stringify(this._manifest, null, 4));

        await new Promise<void>(resolve => {
            storeZip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
                .pipe(fs.createWriteStream(this.outputFilePath))
                .on('finish', () => {
                    logger.info(`${this.outputFilePath} written.`);
                    resolve();
                });
        });
    }

    public async unpack(loadFileData: boolean = true): Promise<void> {
        const fileIndexes = Object.keys(this._manifest.files)
            .map(indexStr => parseInt(indexStr, 10));
        const fileCount = fileIndexes.length;

        let promiseList: Promise<void>[] = new Array(fileCount);
        for(let i = 0; i < fileCount; i++) {
            promiseList[i] = this.getFile(fileIndexes[i], loadFileData).then(async file => {
                if(!!file?.fileId) {
                    this.files[file.fileId] = file;

                    if(loadFileData && file instanceof IndexedFileGroup) {
                        file.fileData = await file.pack();
                    }
                }
            });
        }

        await Promise.all(promiseList);

        this.loaded = true;
    }

    /**
     * Compresses the archive's index data into a flat file for update server usage.
     */
    public async compressIndexData(): Promise<ByteBuffer> {
        await this.loadArchive();

        const files = this.manifest.files;
        const fileIndexes = Object.keys(files).map(indexStr => parseInt(indexStr, 10));
        const fileCount = fileIndexes.length;

        const buffer = new ByteBuffer(250000);
        let writtenFileIndex = 0;

        // Write index file header
        buffer.put(this.manifest.format ?? 5);
        buffer.put(this.manifest.settings ?? 0);
        buffer.put(fileCount, 'short');

        // Write file indexes
        for(const fileIndex of fileIndexes) {
            buffer.put(fileIndex - writtenFileIndex, 'short');
            writtenFileIndex = fileIndex;
        }

        // Write name hashes (if applicable)
        if(this.fileNames) {
            for(const fileIndex of fileIndexes) {
                const file = files[fileIndex];
                const fileName = file.file.replace(this.manifest.fileExtension, '');
                let nameHash: number;
                if(/^[a-zA-Z ]+$/i) {
                    // Actual name
                    nameHash = hash(fileName);
                } else {
                    // Unknown name (hashed still)
                    nameHash = parseInt(fileName, 10);
                }

                buffer.put(nameHash, 'int');
            }
        }

        // Write file crc values
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            buffer.put(file.crc, 'int');
        }

        // Write file version numbers
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            buffer.put(file.version, 'int');
        }

        // Write file group child counts
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            if(file.children?.length) {
                buffer.put(file.children.length, 'short');
            } else {
                buffer.put(0, 'short');
            }
        }

        // Write file group children
        for(const fileIndex of fileIndexes) {
            const file = files[fileIndex];
            if(!file.children?.length) {
                continue;
            }

            writtenFileIndex = 0;

            // Write child indexes
            for(let i = 0; i < file.children.length; i++) {
                const childFile = file.children[i];
                if(!childFile) {
                    continue;
                }

                buffer.put(i - writtenFileIndex, 'short');
                writtenFileIndex = i;
            }

            // Write child name hashes (if applicable)
            if(this.fileNames) {
                for(let i = 0; i < file.children.length; i++) {
                    const childFile = file.children[i];
                    if(!childFile) {
                        continue;
                    }

                    const fileName = childFile.replace(this.manifest.fileExtension, '');
                    let nameHash: number;
                    if(/^[a-zA-Z ]+$/i) {
                        // Actual name
                        nameHash = hash(fileName);
                    } else {
                        // Unknown name (hashed still)
                        nameHash = parseInt(fileName, 10);
                    }

                    buffer.put(nameHash, 'int');
                }
            }
        }

        this.archiveData = buffer.flipWriter();
        return this.archiveData;
    }

    public async getFile(fileId: number, loadFileData: boolean = true): Promise<IndexedFile | null> {
        if(!this._manifest) {
            logger.error(`Index manifest not found - archive not yet loaded. ` +
                `Please use loadArchive() before attempting to access files.`);
            return null;
        }

        const zipArchive = await this.loadZip();

        if(!zipArchive) {
            return null;
        }

        const fileEntry = this._manifest.files[`${fileId}`];
        if(!fileEntry) {
            logger.error(`File not found ${fileId}`);
            return null;
        }

        const file = zipArchive.files[`${fileId}`] || zipArchive.files[`${fileId}/`];

        if(!file) {
            logger.error(`File not found ${fileId}`);
            return null;
        }

        if(file.dir) {
            const folder = zipArchive.folder(fileEntry.file);
            const folderFileNames = Object.keys(folder.files) ?? [];
            const folderFiles: { [key: string]: JSZipObject } = {};
            folderFileNames
                .filter(fileName => fileName?.startsWith(`${fileId}/`) && fileName?.endsWith(this._manifest.fileExtension))
                .forEach(fileName => folderFiles[fileName] = folder.files[fileName]);
            return new IndexedFileGroup(this._manifest, fileId, folderFiles);
        } else {
            const fileData = loadFileData ? new ByteBuffer(await file.async('nodebuffer')) : null;
            return new IndexedFile(this._manifest, fileId, fileData);
        }
    }

    public async loadArchive(force: boolean = false): Promise<void> {
        if(this.loaded && !force) {
            return;
        }

        const zipArchive = await this.loadZip();

        if(!zipArchive) {
            logger.error(`Store zip not found.`);
            return;
        }

        const noFilesError = `No files found within indexed archive ${this.indexId} ${this.indexName}`;
        if(!zipArchive.files) {
            logger.error(noFilesError);
            return;
        }

        const fileNames = Object.keys(zipArchive.files);

        if(!fileNames?.length) {
            logger.error(noFilesError);
            return;
        }

        const manifestFile = zipArchive.files['.manifest.json'];
        if(!manifestFile) {
            logger.error(`Missing manifest file for indexed archive ${this.indexId} ${this.indexName}`);
            return;
        }

        const strContent = await manifestFile.async('string');

        this._manifest = JSON.parse(strContent) as IndexManifest;

        this.loaded = true;
    }

    public async loadZip(): Promise<JSZip> {
        try {
            const archive = await JSZip.loadAsync(readFileSync(this.filePath));

            if(!archive) {
                logger.error(`Error loading indexed archive ${this.indexId} ${this.indexName}`);
                return null;
            }

            return archive;
        } catch(error) {
            logger.error(`Error loading indexed archive ${this.indexId} ${this.indexName}`);
            logger.error(error);
            return null;
        }
    }

    public get manifest(): IndexManifest {
        return this._manifest;
    }

    public get archiveName(): string {
        return getIndexId(this.indexId) as string;
    }

    public get fileNames(): boolean {
        return (this._manifest.settings & 0x01) !== 0
    }

    public get filePath(): string {
        return join(this.fileStore.fileStorePath, `${this.indexId}_${this.indexName}.zip`);
    }

    public get outputFilePath(): string {
        return join(this.storeOutputDir, `${this.indexId}_${this.indexName}.zip`);
    }

    public get storeOutputDir(): string {
        return path.join(this.outputDir, 'stores');
    }

    public get outputDir(): string {
        return path.join('.', 'output');
    }

}
