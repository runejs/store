import fs from 'fs';
import path from 'path';


export interface IndexMetadata {
    version?: number;
    crc32?: number;
    sha256?: string;
}


export interface FileGroupMetadata extends IndexMetadata {
    fileName: string;
    nameHash?: number;
    size?: number;
    fileNames?: string[];
    errors?: string[];
}


export type FileGroupMetadataMap = Map<string, FileGroupMetadata>;


export interface ArchiveIndex extends IndexMetadata {
    index: number;
    groups: FileGroupMetadataMap;
}


export const writeIndexFile = (archivePath: string, manifest: ArchiveIndex): void => {
    fs.writeFileSync(path.join(archivePath, `.index`), JSON.stringify(manifest, (key, value) => {
        if(value instanceof Map) {
            return { dataType: 'Map', value: Array.from(value.entries()) };
        } else {
            return value;
        }
    }, 4));
};


export const readIndexFile = (archivePath: string): ArchiveIndex => {
    return JSON.parse(fs.readFileSync(path.join(archivePath, `.index`), 'utf-8'), (key, value) => {
        if(typeof value === 'object' && value?.dataType === 'Map') {
            return new Map(value.value);
        } else {
            return value;
        }
    }) as ArchiveIndex;
};
