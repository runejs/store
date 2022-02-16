import { CompressionMethod } from '@runejs/common/compress';
import { EncryptionMethod } from '@runejs/common/encrypt';


export interface ArchiveConfig {
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