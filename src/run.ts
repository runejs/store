import { FileStore } from './file-store';
import { logger } from '@runejs/core';
import spriteCodec from './transcoders/sprites/sprite.codec';
import { ClientFileStore } from './client-store';
import * as fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { ByteBuffer } from '@runejs/core/buffer';
import { IndexedFile } from './file-store/file';
import { ArchiveDecompressor } from './client-store/decompression/archive-decompressor';
import { SpriteStorageMethod } from './transcoders/sprites/sprite-sheet';
import { loadXteaRegionFiles } from './util';


function validateSpriteFormats(debugDir: string): void {
    console.log('\n\nChecking column-major files...');

    const debug = true;

    let columnCorrect: number = 0;
    let columnIncorrect: number = 0;
    let spriteFiles = fs.readdirSync(path.join(debugDir, 'sprites-column-major'))
        .filter(fileName => fileName.endsWith('.png'));

    for(let i = 0; i < spriteFiles.length; i++) {
        const spriteFile: Buffer = fs.readFileSync(path.join(debugDir, 'sprites-column-major', spriteFiles[i]));
        const result = spriteCodec.encode({
            fileIndex: i,
            fileName: spriteFiles[i].replace('.png', '')
        }, spriteFile, {
            debug,
            forceStorageMethod: 'column-major'
        });

        if(result === null) {
            columnIncorrect++;
        } else {
            columnCorrect++;
        }
    }

    const columnTotal = columnCorrect + columnIncorrect;
    const columnPercentRight = Math.round((columnCorrect / columnTotal) * 100);

    let rowCorrect = 0;
    let rowIncorrect = 0;

    console.log('\n\nChecking row-major files...');

    spriteFiles = fs.readdirSync(path.join(debugDir, 'sprites-row-major'))
        .filter(fileName => fileName.endsWith('.png'));

    for(let i = 0; i < spriteFiles.length; i++) {
        const spriteFile: Buffer = fs.readFileSync(path.join(debugDir, 'sprites-row-major', spriteFiles[i]));
        const result = spriteCodec.encode({
            fileIndex: i,
            fileName: spriteFiles[i].replace('.png', '')
        }, spriteFile, {
            debug,
            forceStorageMethod: 'row-major'
        });

        if(result === null) {
            rowIncorrect++;
        } else {
            rowCorrect++;
        }
    }

    const rowTotal = rowCorrect + rowIncorrect;
    const rowPercentRight = Math.round((rowCorrect / rowTotal) * 100);

    console.log('');
    console.log(`Row-Major: ${rowPercentRight}% (${rowCorrect}:${rowIncorrect} of ${rowTotal})`);
    console.log(`Column-Major: ${columnPercentRight}% (${columnCorrect}:${columnIncorrect} of ${columnTotal})`);
    console.log('');
}

(async () => {
    const start = Date.now();

    const xteaRegions = async () => loadXteaRegionFiles('config/xteas');

    const clientFileStore = new ClientFileStore('./packed', {
        configDir: './config',
        xteas: await xteaRegions()
    });

    // Decode a packed client cache with this vvv
    // await clientFileStore.decompressArchives(false);
    // await ArchiveDecompressor.writeFileNames();

    // Decode a single packed client cache archive with this line vvv
    // await clientFileStore.getIndex('sprites').decompressArchive(false, true);


    validateSpriteFormats(`D:/rsdev`);

    /*([
        [ 780, 'sideicons_interface,6', 'row-major' ],
        [ 781, 'sideicons_interface,7', 'column-major' ],
        // [ 460, 'painting2', 'row-major' ],
        // [ 213, 'staticons,16', 'column-major' ],
        // [ 203, 'staticons,6', 'row-major' ]
    ] as [ number, string, SpriteStorageMethod ][]).forEach(file => {
        const [ fileIndex, fileName, storageType ] = file;
        console.log(`Original: ${storageType}`);
        const spriteFile: Buffer = fs.readFileSync(`./stores/sprites/${fileName}.png`);
        spriteCodec.encode({ fileIndex, fileName }, spriteFile, {
            debug: true,
            forceStorageMethod: storageType
        });
        console.log('\n');
    });*/

    // const fileStore = new FileStore();

    // await fileStore.loadStoreArchives();

    // await fileStore.indexedArchives.get(5).unpack();

    /*const mapArchive = await fileStore.getArchive(5);
    const mapFile = await mapArchive.loadFile(382, true) as FlatFile;

    console.log(mapFile.fileData);

    const mapData = mapCodec.decode(mapFile.fileData);

    console.log(mapData);

    console.log(mapCodec.encode(mapData));*/

    // const itemFileCodec = new FileCodec('item-codec-v3.json5');
    // itemFileCodec.decodeBinaryFile(itemId, new ByteBuffer(fileData));

    /*for(let i = 0; i < fileStore.indexedArchives.size; i++) {
        // logger.info(`Unpacking archive ${i}...`);
        logger.info(`Indexing archive ${i}...`);
        await fileStore.indexedArchives.get(i).indexArchiveFiles();
    }*/

    // await fileStore.generateCrcTable();

    /*
    @TODO vvv Cleanup Sprite Codec Testing
    await fileStore.getArchive('sprites').unpack(true, false);

    const spriteArchive = fileStore.getArchive('sprites');
    const spriteKeys = Object.keys(spriteArchive.files);

    const spritesDir = path.join('output', 'sprites');
    if(fs.existsSync(spritesDir)) {
        fs.rmSync(spritesDir, { recursive: true });
    }

    fs.mkdirSync(spritesDir, { recursive: true });

    for(const spriteKey of spriteKeys) {
        const sprite: IndexedFile = spriteArchive.files[spriteKey];
        if(sprite.fileData) {
            const image = spriteCodec.decode(sprite.fileData);

            try {
                image.pack();

                const pngBuffer = PNG.sync.write(image);
                fs.writeFileSync(path.join(spritesDir, `${sprite.fileName}.png`), pngBuffer);
            } catch(error) {
                logger.error(`Error writing sprite ${spriteKey}.`);
            }
        }
    }
    const sprite = fileStore.getArchive('sprites').files[494].fileData;*/

    const end = Date.now();
    const duration = end - start;
    logger.info(`Operations completed in ${duration / 1000} seconds.`);
})();
