import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const python = process.env.ENGINE_PYTHON || 'python3';
const ytdlp = process.env.YTDLP || 'yt-dlp';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const profile = await mkdtemp(join(tmpdir(), 'vdh-engine-test-'));
// Grant native messaging at test install time; production requests it on click.
const source = join(profile, 'extension');
await cp(resolve('extension'), source, { recursive: true });
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
manifest.permissions.push('nativeMessaging'); delete manifest.optional_permissions;
await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
let context;
try {
 context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', ignoreDefaultArgs: ['--disable-extensions'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: [`--disable-extensions-except=${source}`, `--load-extension=${source}`] });
 const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', {timeout:15000});
 const id = new URL(worker.url()).host;
 execFileSync(python, ['companion/install.py','--extension-id', id, '--manifest-dir', join(profile,'NativeMessagingHosts'), '--home', join(profile,'engine'), '--ytdlp', ytdlp, '--ffmpeg', ffmpeg]);
 const config = JSON.parse(await readFile(join(profile,'engine/config.json'),'utf8'));
 config.downloads = join(profile,'downloads'); config.node = process.execPath;
 await writeFile(join(profile,'engine/config.json'), JSON.stringify(config));
 const page = await context.newPage();
 await page.goto('https://www.youtube.com/watch?v=bg1sT4ILG0w', {waitUntil:'domcontentloaded',timeout:30000});
 const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(t=>t.url?.includes('watch?v=bg1sT4ILG0w')).id);
 const ui = await context.newPage(); await page.bringToFront(); await ui.goto(`chrome-extension://${id}/popup.html`);
 const message = async(type,extra={}) => ui.evaluate(async data=>{const r=await chrome.runtime.sendMessage(data);if(r.error)throw new Error(r.error);return r.data;},{type,tabId,...extra});
 assert.equal((await message('engine-status')).ready,true,'native host handshake');
 console.log('PASS native host handshake in isolated browser profile');
 let record=await message('engine-inspect');
 const formats=record.items.filter(item=>item.native);
 assert.ok(formats.length>5);
 assert.ok(formats.some(f=>f.width===1920));
 assert.ok(formats.some(f=>f.format==='WEBM'));
 console.log(`PASS exact YouTube video: ${formats.length} usable formats, audio pairs, real dimensions, MP4/WebM`);
 await ui.getByRole('button',{name:'Scan page',exact:true}).click();
 await ui.getByRole('status').filter({hasText:'Scan complete'}).waitFor();
 const quality=ui.getByLabel('Video quality').filter({has:ui.locator('option[value*="vdh-format"]')}).first();
 await quality.waitFor();
 for(const chosen of [formats.find(f=>f.native.formatId==='160') || formats.at(-1), formats.find(f=>f.native.formatId==='247') || formats.find(f=>f.format==='WEBM')]) {
 await quality.selectOption(chosen.url);
 const card=quality.locator('xpath=ancestor::article');
 await card.getByLabel('Filename').fill('Engine test.mp4');
 const beforeJobs = new Set(Object.keys(await message('engine-jobs')));
 await card.getByRole('button',{name:'Download',exact:true}).click();
 let job;
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){
  const jobs=await message('engine-jobs'); job=Object.entries(jobs).find(([id])=>!beforeJobs.has(id))?.[1];
  if(['complete','failed'].includes(job?.status)) break;
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.equal(job?.status,'complete',job?.error || 'download did not finish');
 const metadata=JSON.parse(execFileSync(process.env.FFPROBE||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',job.filename],{encoding:'utf8'}));
 assert.ok(metadata.streams.some(s=>s.codec_type==='audio'));
 assert.ok(metadata.streams.some(s=>s.codec_type==='video' && s.width===chosen.width && s.height===chosen.height));
 assert.ok(Number(metadata.format.duration)>300);
 console.log(`PASS real UI ${chosen.format} download: merged video+audio, ${chosen.width}×${chosen.height}, ${Math.round(metadata.format.duration)}s, ${metadata.format.size} bytes`);
 }
 await mkdir('test-results',{recursive:true}); await ui.locator('body').screenshot({path:'test-results/engine-popup.png'});
} finally {await context?.close();await rm(profile,{recursive:true,force:true});}
