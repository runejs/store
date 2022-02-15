import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'graceful-fs';
import { ByteBuffer, logger } from '@runejs/common';
import { FileIndexEntity } from '../db';
import { AdditionalFileProperties, IndexedFile } from './indexed-file';


export class FlatFile extends IndexedFile<FileIndexEntity> {

    public constructor(index: FileIndexEntity, properties?: Partial<AdditionalFileProperties>) {
        super(index, properties);

        if(this.isSet(index.stripes)) {
            this.stripes = index.stripes.split(',').map(n => Number(n));
        }

        if(this.isSet(index.stripeCount)) {
            this.stripeCount = index.stripeCount;
        }
    }

    public override read(compress: boolean = false): ByteBuffer | null | Promise<ByteBuffer | null> {
        if(!this.group) {
            throw new Error(`Flat file ${this.key} could not be read as it does not belong to any known groups.`);
        }

        const filePath = this.path;

        if(!existsSync(filePath)) {
            logger.error(`File not found: ${filePath}`);
            this.recordError('NOT_FOUND');
            return null;
        }

        let data: Buffer | null = null;

        try {
            data = readFileSync(filePath);
        } catch(error) {
            logger.error(`Error reading file at ${filePath}:`, error);
            data = null;
        }

        if(!data) {
            this.recordError('INVALID');
        } else if(!data.length) {
            this.recordError('EMPTY');
        } else {
            const fileData = new ByteBuffer(data);

            if(!this.name) {
                this.name = this.group.name || this.key;
            }

            if(!this.nameHash) {
                this.nameHash = this.group.nameHash || undefined;
            }

            if(!this.stripes) {
                const stripeStr = this.index.stripes;
                if(stripeStr?.length) {
                    this.stripes = stripeStr.split(',')?.map(s => Number(s)) ?? undefined;
                }
            }

            if(!this.crc32) {
                this.crc32 = this.index.crc32 ?? 0;
            }

            if(!this.sha256) {
                this.sha256 = this.index.sha256 ?? undefined;
            }

            this.setData(fileData, false);

            if(this.size !== this.index.size || this.sha256 !== this.generateSha256()) {
                this._modified = true;
            }

            this._loaded = true;

            return fileData;
        }

        logger.error(`Error reading file data: ${filePath}`);
        return null;
    }

    public override write(): void | Promise<void> {
        if(this.empty) {
            let name = (this.name || this.key);

            if(this.group) {
                if(this.group.fileCount > 1) {
                    name = `${(this.group.name || this.group.key)}:${name}`;
                } else {
                    name = (this.group.name || this.group.key);
                }
            }

            logger.error(`Error writing file ${name}: File is empty.`);
        } else {
            const filePath = this.outputPath;
            const fileData = this.data.toNodeBuffer();

            // if(existsSync(filePath)) {
            //     rmSync(filePath, { recursive: true, force: true });
            // }

            writeFileSync(filePath, fileData);
        }
    }

    public override async validate(): Promise<void> {
        super.validate();
        await this.store.indexService.verifyFileIndex(this);
    }

    public override get path(): string {
        const groupPath = this.group?.path || null;
        if(!groupPath) {
            throw new Error(`Error generating file path; File ${this.key} has not been added to a group.`);
        }

        const extension = (this.archive?.config?.contentType || '');

        if(this.group.fileCount === 1) {
            return groupPath + extension;
        } else {
            return join(groupPath, String(this.name || this.key)) + extension;
        }
    }

    public override get outputPath(): string {
        const groupOutputPath = this.group?.outputPath || null;
        if(!groupOutputPath) {
            throw new Error(`Error generating file output path; File ${this.key} has not been added to a group.`);
        }

        if(this.group.fileCount === 1) {
            return groupOutputPath + this.type;
        } else {
            return join(groupOutputPath, String(this.name || this.key) + this.type);
        }
    }

    public get type(): string {
        return this.archive?.config?.contentType ?? '';
    }

}
