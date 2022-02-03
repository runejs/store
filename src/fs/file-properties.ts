import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';
import { Archive, FileIndex, Group, Store } from './index';
import { setObjectProps } from '@runejs/common/util';
import { IndexService } from '../db';


export class FileProperties {
    key: string;

    store: Store | null = null;
    archive: Archive | null = null;
    group: Group | null = null;

    encryption: EncryptionMethod | [ EncryptionMethod, string ] = 'none';
    encrypted: boolean = false;
    compression: CompressionMethod = 'none';
    compressed: boolean = false;

    name: string = '';
    nameHash: number = -1;
    version: number = 0;
    size: number = 0;
    crc32: number = -1;
    sha256: string = '';
    stripes: number[] = [];
    stripeCount: number = 1;

    protected constructor(properties?: Partial<FileProperties>) {
        setObjectProps<FileProperties>(this, properties);
    }

    public get numericKey(): number {
        return Number(this.key);
    }

    public get hasNameHash(): boolean {
        return this.nameHash !== undefined && this.nameHash !== null && this.nameHash !== -1 && !isNaN(this.nameHash);
    }

    public get indexService(): IndexService {
        return this.store.indexService;
    }
}

export interface ArchiveProperties {
    index: number;
    name: string;
    format?: number;
    versioned?: boolean;
    compression?: CompressionMethod;
    encryption?: EncryptionMethod | [ EncryptionMethod, string ];
    contentType?: string;
    filesNamed?: boolean;
    groupNames?: { [key: string]: number };
}
