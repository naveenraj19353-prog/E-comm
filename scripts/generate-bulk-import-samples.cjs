const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const XLSX = require("../client/node_modules/xlsx");
const JSZip = require("../client/node_modules/jszip");

const outputRoot = path.resolve(__dirname, "../bulk-import-test");

const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
});

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, checksum]);
};

const createSolidPng = (red, green, blue, width = 320, height = 200) => {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let index = 0; index < width; index += 1) {
        row[1 + index * 3] = red;
        row[2 + index * 3] = green;
        row[3 + index * 3] = blue;
    }
    const pixels = Buffer.concat(Array.from({ length: height }, () => row));
    return Buffer.concat([
        signature,
        pngChunk("IHDR", header),
        pngChunk("IDAT", zlib.deflateSync(pixels)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
};

const commonInstructions = [
    ["Field", "Required", "Description"],
    ["productId", "No", "MongoDB product ID for updates; blank creates a product."],
    ["name", "Yes", "Rows with the same name and categoryId form one product."],
    ["categoryId", "Yes", "Replace REPLACE_WITH_CATEGORY_ID with a real tenant category ID."],
    ["imagePath", "No", "Upload the matching image folder or ZIP after selecting this workbook."],
];

const scenarios = {
    retail: {
        instructions: [
            ...commonInstructions,
            ["brand", "No", "Retail product brand."],
            ["color / size / stock", "Yes", "One row per variant combination."],
        ],
        rows: [
            {
                productId: "",
                name: "Sample Cotton Shirt",
                description: "Comfortable cotton shirt",
                categoryId: "REPLACE_WITH_CATEGORY_ID",
                categoryName: "Shirts",
                brand: "Sample Brand",
                price: 999,
                discountPercentage: 10,
                color: "Black",
                size: "M",
                stock: 20,
                variantId: "",
                imagePath: "retail-shirt-black.png",
            },
            {
                productId: "",
                name: "Sample Cotton Shirt",
                description: "Comfortable cotton shirt",
                categoryId: "REPLACE_WITH_CATEGORY_ID",
                categoryName: "Shirts",
                brand: "Sample Brand",
                price: 999,
                discountPercentage: 10,
                color: "Black",
                size: "L",
                stock: 12,
                variantId: "",
                imagePath: "retail-shirt-black.png",
            },
        ],
        images: {
            "retail-shirt-black.png": [35, 35, 42],
        },
    },
    service: {
        instructions: [
            ...commonInstructions,
            ["location", "Yes", "Service category/location shown to customers."],
            ["availability", "Yes", "Use Available or Unavailable."],
        ],
        rows: [
            {
                productId: "",
                name: "Sample Home Cleaning",
                description: "Professional home cleaning service",
                categoryId: "REPLACE_WITH_CATEGORY_ID",
                categoryName: "Cleaning",
                location: "Bengaluru",
                price: 1499,
                discountPercentage: 0,
                availability: "Available",
                imagePath: "service-home-cleaning.png",
            },
        ],
        images: {
            "service-home-cleaning.png": [45, 145, 95],
        },
    },
    menu: {
        instructions: [
            ...commonInstructions,
            ["foodType", "Yes", "Use Veg or Non-Veg."],
            ["color / size / stock", "Yes", "One row per menu variant combination."],
        ],
        rows: [
            {
                productId: "",
                name: "Sample Paneer Pizza",
                description: "Fresh paneer pizza",
                categoryId: "REPLACE_WITH_CATEGORY_ID",
                categoryName: "Pizza",
                foodType: "Veg",
                price: 299,
                discountPercentage: 0,
                color: "Regular",
                size: "Small",
                stock: 25,
                variantId: "",
                imagePath: "menu-paneer-pizza.png",
            },
            {
                productId: "",
                name: "Sample Paneer Pizza",
                description: "Fresh paneer pizza",
                categoryId: "REPLACE_WITH_CATEGORY_ID",
                categoryName: "Pizza",
                foodType: "Veg",
                price: 299,
                discountPercentage: 0,
                color: "Regular",
                size: "Large",
                stock: 15,
                variantId: "",
                imagePath: "menu-paneer-pizza.png",
            },
        ],
        images: {
            "menu-paneer-pizza.png": [225, 125, 45],
        },
    },
};

const createWorkbook = (scenario, config) => {
    const workbook = XLSX.utils.book_new();
    const instructions = XLSX.utils.aoa_to_sheet(config.instructions);
    const products = XLSX.utils.json_to_sheet(config.rows);
    instructions["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 80 }];
    products["!cols"] = Object.keys(config.rows[0]).map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
    XLSX.utils.book_append_sheet(workbook, products, "Products");
    XLSX.writeFile(
        workbook,
        path.join(outputRoot, `${scenario}-bulk-import-template.xlsx`),
    );
};

const generate = async () => {
    fs.mkdirSync(outputRoot, { recursive: true });
    for (const [scenario, config] of Object.entries(scenarios)) {
        createWorkbook(scenario, config);
        const imageDirectory = path.join(outputRoot, `${scenario}-images`);
        fs.mkdirSync(imageDirectory, { recursive: true });
        const zip = new JSZip();
        for (const [fileName, color] of Object.entries(config.images)) {
            const png = createSolidPng(...color);
            fs.writeFileSync(path.join(imageDirectory, fileName), png);
            zip.file(fileName, png);
        }
        fs.writeFileSync(
            path.join(outputRoot, `${scenario}-images.zip`),
            await zip.generateAsync({ type: "nodebuffer" }),
        );
    }
    console.log(`Bulk import samples created in ${outputRoot}`);
};

generate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
