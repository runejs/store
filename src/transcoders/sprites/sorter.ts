import { ColorFrequency, ColorUsageMap } from './sprite-encoder';
import { HCL, HSB, HSL, IColor, LAB, RGB, RGBA } from '../../util/colors';
import { toRadians } from '../../util/math';


interface Sort {
    val: number;
    dir: 'asc' | 'desc';
    flipped?: boolean;
}


function sortableColor(rgb: RGB, t = 1): Sort[] {
    const { red, green, blue } = rgb;

    const redPercent = Math.floor(red / 255 * 100);
    const greenPercent = Math.floor(green / 255 * 100);
    const bluePercent = Math.floor(blue / 255 * 100);

    const mod = 8;

    const redMod = Math.round(red / 255 * mod);
    const greenMod = Math.round(green / 255 * mod);
    const blueMod = Math.round(blue / 255 * mod);

    return [
        {
            val: blueMod,
            dir: 'desc'
        },
        {
            val: greenMod,
            dir: 'asc'
        },
        {
            val: redMod,
            dir: 'asc'
        },
    ];

    /*let { hue, saturation, lightness } = new HSL(rgb);

    const hueMod = 16;
    const satMod = 10;
    const lightMod = 10;

    console.log(Math.floor(hue / hueMod));

    return [
        {
            val: Math.floor(hue / hueMod),
            dir: 'desc'
        },
        {
            val: Math.floor(lightness / lightMod),
            dir: 'desc'
        },
        {
            val: Math.floor(saturation / satMod),
            dir: 'desc'
        },
    ];*/
}


export const sortPalette = (palette: RGBA[]) => {
    /*const hueMod = 8;

    const hslList: HSL[] = new Array(palette.length - 1);
    return [ palette[0], ...palette.slice(1).map((rgb, i) => {
        const hsl = hslList[i] = new HSL(rgb);
        return [ Math.floor(hsl.hue / hueMod), -hsl.lightness, hsl.saturation ];
    }).sort().map(arr => {
        const [ h1, l1, s1 ] = arr;
        return hslList.find(hsl => {
            const { hue, saturation, lightness } = hsl;
            if(h1 === Math.floor(hue / hueMod)) {
                return saturation === s1 && -lightness === l1;
            }
            return false;
        }).rgb as RGBA;
    }) ];*/

    // return [ palette[0], ...palette.slice(1).map(c => [ c.green, c.blue, c.red ]).sort()
    //     .map(c => new RGBA(c[2], c[0], c[1])) ];

    /*return [ palette[0], ...palette.slice(1).sort((c1, c2) => {
        const diffRed = Math.abs(c1.red - c2.red);
        const diffGreen = Math.abs(c1.green - c2.green);
        const diffBlue = Math.abs(c1.blue - c2.blue);

        const pctDiffRed = diffRed / 255;
        const pctDiffGreen = diffGreen / 255;
        const pctDiffBlue = diffBlue / 255;

        const delta = Math.floor((pctDiffRed + pctDiffGreen + pctDiffBlue) / 3 * 100)
        if(delta < 10) {
            return new HSL(c2).lightness - new HSL(c1).lightness;
        }

        return delta;
    }) ];*/

    return palette.sort((a, b) => colorSorter(a, b));
};


export const colorSorter = (a: RGBA, b: RGBA): number => {
    /*const { hue: h1, chroma: c1, luminance: l1 } = new HCL(rgb1);
    const { hue: h2, chroma: c2, luminance: l2 } = new HCL(rgb2);

    const Al = 1.4456;
    const Ach_inc = 0.16;

    let Dh = Math.abs(h1 - h2);
    if (Dh > 180) Dh = 360 - Dh;
    const Ach = Dh + Ach_inc;
    const AlDl = Al * Math.abs(l1 - l2);
    return Math.sqrt(AlDl * AlDl + (c1 * c1 + c2 * c2 - 2 * c1 * c2 * Math.cos(toRadians(Dh))));
    // return Math.sqrt(AlDl * AlDl + Ach * (c1 * c1 + c2 * c2 - 2 * c1 * c2 * Math.cos(toRadians(Dh))));*/

    if(a.isTransparent || b.isTransparent) {
        return 0;
    }

    // console.log(new LAB(a).delta(new LAB(b)));

    const sortOrderA = sortableColor(a);
    const sortOrderB = sortableColor(b);

    for(let i = 0; i < sortOrderA.length; i++) {
        const sortA: Sort = sortOrderA[i];
        const sortB: Sort = sortOrderB[i];

        const { val: valueA, dir } = sortA;
        const valueB = sortB.val;

        if(valueA !== valueB) {
            return dir === 'asc' ? valueB - valueA : valueA - valueB;
        }

        // if(valueA > valueB) {
        //     return dir === 'asc' ? -1 : 1;
        // } else if(valueB > valueA) {
        //     return dir === 'asc' ? 1 : -1;
        // }
    }

    return 0;//new LAB(a).delta(new LAB(b));
};


export const frequencySorter = (a: ColorFrequency, b: ColorFrequency, usageMap: ColorUsageMap): number => {
    if(a.code === '-' || b.code === '-' || a.color.isTransparent || b.color.isTransparent) {
        return 0;
    }

    const hslA = new HSL(a.color);
    const hslB = new HSL(b.color);

    if(a.frequency > b.frequency) {
        return 1;
    } else if(a.frequency < b.frequency) {
        return -1;
    }

    if(a.code !== '-' && b.code !== '-') {
        if(hslA.lightness > hslB.lightness) {
            return -1;
        } else if(hslA.lightness < hslB.lightness) {
            return 1;
        }
    }

    return 0;

    // return a.frequency - b.frequency;
    /*

    if(rgbA.intensity > rgbB.intensity) {
        //return 1;
    } else if(rgbA.intensity < rgbB.intensity) {
        //return -1;
    }

    if(hslA.lightness > hslB.lightness) {
        return 1;
    } else if(hslA.lightness < hslB.lightness) {
        return -1;
    }

    const rangesA = usageMap[a.color];
    const rangesB = usageMap[b.color];
    if(rangesA && rangesB) {
        if(rangesA.rangeCount > rangesB.rangeCount) {
            //return 1;
        } else if(rangesA.rangeCount < rangesB.rangeCount) {
            //return -1;
        }
    }

    if(a.frequency > b.frequency) {
        return -1;
    } else if(a.frequency < b.frequency) {
        return 1;
    }

    return 0;*/
}
