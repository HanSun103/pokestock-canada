import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzePublicationWithGpt } from "./pipeline/gpt-normalizer.js";

const publicationPath = process.argv[2];
if (!publicationPath) throw new Error("Usage: npm run demo:gpt -- <publication.json>");

const publication = JSON.parse(await readFile(resolve(publicationPath), "utf8"));
const catalog = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const result = await analyzePublicationWithGpt(publication, catalog.products);
console.log(JSON.stringify(result, null, 2));
