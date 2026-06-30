import fs from "fs/promises";
import path from "path";

const ASSETS_FILE = "C:/Users/Buxe/Projects/Neuer Ordner/assets (1).txt";
const LYRA_FILE = "C:/Users/Buxe/Projects/Neuer Ordner/Lyra fotos.txt";
const OUT_FILE = path.resolve("public/media.json");

interface Album {
  urls: string[];
  tags?: string[];
}

interface MediaJson {
  lyra: Record<string, Album>;
  nuria: string[];
  sissy_captions: string[];
  misc_gifs: string[];
}

function extractUrlsBetween(content: string, startMarker: string, endMarker?: string): string[] {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return [];
  const endIdx = endMarker ? content.indexOf(endMarker, startIdx + startMarker.length) : content.length;
  const block = content.slice(startIdx, endIdx === -1 ? content.length : endIdx);
  return [...block.matchAll(/https?:\/\/[^\s'"`,\]]+/g)].map((m) => m[0]);
}

async function parseAssets(): Promise<Partial<MediaJson>> {
  const content = await fs.readFile(ASSETS_FILE, "utf-8");
  return {
    nuria: extractUrlsBetween(content, "nuria:", "sissy captions:"),
    sissy_captions: extractUrlsBetween(content, "sissy captions:", "misc:"),
    misc_gifs: extractUrlsBetween(content, "misc:"),
  };
}



function normalizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, "")
    .replace(/\.jpg$/g, "")
    .replace(/\.jpeg$/g, "")
    .replace(/\.png$/g, "")
    .replace(/\.webp$/g, "")
    .replace(/\.gif$/g, "");
}

function filenameFromUrl(url: string): string {
  try {
    return path.basename(new URL(url).pathname);
  } catch {
    return "";
  }
}

async function parseLyraPhotos(): Promise<Record<string, Album>> {
  const content = await fs.readFile(LYRA_FILE, "utf-8");
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const rawAlbums: Record<string, { urls: string[]; tagMap: Map<string, string> }> = {};
  let current: string | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(Charlie\d+):?$/i);
    if (headerMatch) {
      current = headerMatch[1].toLowerCase();
      rawAlbums[current] = { urls: [], tagMap: new Map() };
      continue;
    }
    if (!current) continue;

    if (line.startsWith("http")) {
      rawAlbums[current].urls.push(line);
      continue;
    }

    // Tag line like "IMG_0001.JPG TagFullyDressed"
    const tagMatch = line.match(/^([A-Za-z0-9_-]+\.\w+)\s+(\S.*)$/);
    if (tagMatch) {
      const key = normalizeFilename(tagMatch[1]);
      rawAlbums[current].tagMap.set(key, tagMatch[2].trim());
    }
  }

  const albums: Record<string, Album> = {};
  for (const [name, data] of Object.entries(rawAlbums)) {
    const tags = data.urls.map((url) => {
      const fname = normalizeFilename(filenameFromUrl(url));
      return data.tagMap.get(fname) ?? "unknown";
    });
    albums[name] = { urls: data.urls, tags };
  }

  return albums;
}

async function main() {
  const [assets, lyra] = await Promise.all([parseAssets(), parseLyraPhotos()]);

  const media: MediaJson = {
    lyra,
    nuria: assets.nuria ?? [],
    sissy_captions: assets.sissy_captions ?? [],
    misc_gifs: assets.misc_gifs ?? [],
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(media, null, 2), "utf-8");

  console.log("media.json regenerated");
  console.log("Lyra albums:", Object.keys(lyra).map((k) => `${k}(${lyra[k].urls.length} urls, ${lyra[k].tags?.length ?? 0} tags)`).join(", "));
  console.log("Nuria:", media.nuria.length);
  console.log("Sissy captions:", media.sissy_captions.length);
  console.log("Misc GIFs:", media.misc_gifs.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
