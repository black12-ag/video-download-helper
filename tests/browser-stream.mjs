import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const executablePath = process.env.CHROME_PATH;
const directory = await mkdtemp(join(tmpdir(), 'extension-stream-'));
const media = join(directory, 'media'); await mkdir(media);
for (const [name, size] of [['high', '640x360'], ['low', '320x180']]) execFileSync(process.env.FFMPEG || 'ffmpeg', ['-v','error','-f','lavfi','-i',`testsrc2=s=${size}:d=4`,'-f','lavfi','-i','sine=duration=4','-c:v','libx264','-pix_fmt','yuv420p','-g','24','-c:a','aac','-shortest','-hls_time','1','-hls_list_size','0',join(media,`${name}.m3u8`)]);
await writeFile(join(media,'master.m3u8'),'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"\nhigh.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=320x180,CODECS="avc1.64000c,mp4a.40.2"\nlow.m3u8\n');
let authenticated = 0, denied = 0, slow = false;
const server = http.createServer(async(req,res)=>{
 const path = new URL(req.url,'http://localhost').pathname;
 if(path==='/') {res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':'media_session=test_only; Path=/private/; HttpOnly; SameSite=Lax'});res.end('<title>Signed-in stream test</title><video title="Private mountain video" preload="none" src="/private/master.m3u8"></video>');return;}
 if(!path.startsWith('/private/')){res.writeHead(404).end();return;}
 if(!req.headers.cookie?.includes('media_session=test_only')){denied++;res.writeHead(403).end();return;}
 authenticated++;
 try {
  const data=await readFile(join(media,path.slice('/private/'.length)));
  res.writeHead(200,{'Content-Type':extname(path)==='.m3u8'?'application/vnd.apple.mpegurl':'video/mp2t','Content-Length':data.length,'Cache-Control':'no-store'});
  if(slow&&path.endsWith('.ts')){
   let n=0;const timer=setInterval(()=>{if(res.destroyed){clearInterval(timer);return;}res.write(data.subarray(n,n+2048));n+=2048;if(n>=data.length){clearInterval(timer);res.end();}},80);res.on('close',()=>clearInterval(timer));
  }else res.end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let context;
try{
 context=await chromium.launchPersistentContext(join(directory,'profile'),{headless:process.env.HEADED!=='1',channel:'chromium',executablePath,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${resolve('extension')}`,`--load-extension=${resolve('extension')}`]});
 if(process.env.NATIVE_PICKER!=='1')await context.addInitScript(()=>{
  if(location.protocol==='chrome-extension:'&&location.pathname==='/stream.html')window.showSaveFilePicker=async()=>{
   const root=await navigator.storage.getDirectory();const file=await root.getFileHandle('hls-output.mp4',{create:true});
   if(location.search.includes('preserve')){const out=await file.createWritable();await out.write('existing-user-file');await out.close();}
   return file;
  };
 });
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
 const id=new URL(worker.url()).host;
 const page=await context.newPage();await page.goto(origin);
 const tabId=await worker.evaluate(async origin=>(await chrome.tabs.query({})).find(tab=>tab.url===origin+'/').id,origin);
 const ui=await context.newPage();await page.bringToFront();await ui.goto(`chrome-extension://${id}/popup.html`);
 const message=async(type,extra={})=>ui.evaluate(async request=>{const response=await chrome.runtime.sendMessage(request);if(response?.error)throw new Error(response.error);return response?.data;},{type,tabId,...extra});
 await message('scan');
 const inspected=await message('hls-inspect',{url:`${origin}/private/master.m3u8`});
 const variants=inspected.items.filter(item=>item.hls);
 assert.ok(variants.some(item=>item.height===360));assert.ok(variants.some(item=>item.height===180));
 assert.ok(authenticated>0,'media requests carried the browser session without cookie export');assert.equal(denied,0);
 await assert.rejects(()=>message('stream-get',{jobId:'not-registered'}),/registered|Invalid|download/);
 const chosen=variants.find(item=>item.height===180);
 let nextTab=context.waitForEvent('page');const job=await message('download',{url:chosen.url,name:'My chosen stream.mp4'});
 const stream=await nextTab;await stream.waitForURL(/stream\.html#/);
 await stream.getByRole('button',{name:'Save video…',exact:true}).waitFor({state:'visible'});
 assert.equal(await stream.getByRole('button',{name:'Save video…',exact:true}).isEnabled(),true,'real extension sender tab registered');
 console.log('PASS extension HLS inspection, both qualities, browser session cookie and trusted download-tab binding');
 await stream.getByRole('button',{name:'Save video…',exact:true}).click();
 if(process.env.NATIVE_PICKER==='1')console.log('NATIVE_PICKER_READY');
 const waitJob=async(predicate,timeout=30000)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const jobs=await message('download-jobs');const value=jobs.find(predicate);if(value)return value;await new Promise(resolve=>setTimeout(resolve,200));}
  throw new Error('Stream job state timed out: '+JSON.stringify(await message('download-jobs')));
 };
 const completed=await waitJob(value=>value.jobId===job.jobId&&['complete','failed'].includes(value.status),process.env.NATIVE_PICKER==='1'?180000:30000);
 assert.equal(completed.status,'complete',completed.error);
 let bytes;
 if(process.env.NATIVE_PICKER==='1')bytes=await readFile(process.env.NATIVE_OUTPUT);
 else bytes=Buffer.from(await stream.evaluate(async()=>Array.from(new Uint8Array(await(await(await navigator.storage.getDirectory()).getFileHandle('hls-output.mp4')).getFile().then(file=>file.arrayBuffer())))));
 const output=join(directory,'verified.mp4');await writeFile(output,bytes);
 const metadata=JSON.parse(execFileSync(process.env.FFPROBE||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
 assert.ok(metadata.streams.some(track=>track.codec_type==='video'&&track.width===320&&track.height===180));assert.ok(metadata.streams.some(track=>track.codec_type==='audio'));
 execFileSync(process.env.FFMPEG||'ffmpeg',['-v','error','-i',output,'-f','null','-']);
 assert.equal(completed.fileSize,bytes.length);
 console.log(`PASS full extension save flow, ${bytes.length} MP4 bytes, selected320x180+audio, FFprobe and full decode`);
 await mkdir('test-results',{recursive:true});await stream.screenshot({path:'test-results/extension-stream.png'});
 if(process.env.NATIVE_PICKER!=='1'){
  slow=true;
  nextTab=context.waitForEvent('page');const stoppedJob=await message('download',{url:chosen.url,name:'Stopped stream.mp4'});const stopTab=await nextTab;await stopTab.waitForURL(/stream\.html#/);
  await stopTab.evaluate(async()=>{const file=await(await navigator.storage.getDirectory()).getFileHandle('hls-output.mp4',{create:true});const out=await file.createWritable();await out.write('existing-user-file');await out.close();});
  await stopTab.getByRole('button',{name:'Save video…',exact:true}).click();
  await waitJob(value=>value.jobId===stoppedJob.jobId&&value.status==='downloading');
  await message('cancel-download',{jobId:stoppedJob.jobId});await waitJob(value=>value.jobId===stoppedJob.jobId&&value.status==='cancelled');
  await stopTab.waitForTimeout(500);
  const old=await stopTab.evaluate(async()=>await(await(await navigator.storage.getDirectory()).getFileHandle('hls-output.mp4')).getFile().then(file=>file.text()));
  assert.equal(old,'existing-user-file','Stop aborts the atomic write instead of replacing the previous file');
  nextTab=context.waitForEvent('page');const waiting=await message('download',{url:chosen.url,name:'Close me.mp4'});const closing=await nextTab;await closing.waitForURL(/stream\.html#/);await closing.close();
  await waitJob(value=>value.jobId===waiting.jobId&&value.status==='cancelled');
  console.log('PASS stream Stop preserves previous file, close-tab cancellation and no external helper');
 }
}finally{await context?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
