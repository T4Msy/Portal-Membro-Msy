// Converte os módulos TS (sem React) da Masayoshi Plataforma em ES modules JS para o portal.
// Uso: node port-space.cjs <raiz-da-plataforma> <pasta-destino>
const fs = require('fs');
const path = require('path');

const [, , platRoot, outRoot] = process.argv;
const ts = require(path.join(platRoot, 'node_modules', 'typescript'));
const src = path.join(platRoot, 'src');

// arquivo de origem (relativo a src) -> destino (relativo a outRoot)
const MAP = {
  'lib/presenceThrottle.ts': 'lib/presenceThrottle.js',
  'features/chat/mergeMessages.ts': 'chat/mergeMessages.js',
  'features/voice/VoiceSession.ts': 'voice/VoiceSession.js',
  'features/voice/media/audioOutput.ts': 'voice/media/audioOutput.js',
  'features/voice/media/capabilities.ts': 'voice/media/capabilities.js',
  'features/voice/media/devices.ts': 'voice/media/devices.js',
  'features/voice/media/screen.ts': 'voice/media/screen.js',
  'features/voice/media/speaking.ts': 'voice/media/speaking.js',
  'features/voice/webrtc/MeshTransport.ts': 'voice/webrtc/MeshTransport.js',
  'features/voice/webrtc/PeerLink.ts': 'voice/webrtc/PeerLink.js',
  'features/voice/webrtc/SignalingChannel.ts': 'voice/webrtc/SignalingChannel.js',
  'features/voice/webrtc/iceServers.ts': 'voice/webrtc/iceServers.js',
  'features/voice/webrtc/peerBeacons.ts': 'voice/webrtc/peerBeacons.js',
  'features/voice/webrtc/sdp.ts': 'voice/webrtc/sdp.js',
  'features/voice/webrtc/types.ts': 'voice/webrtc/types.js',
};

// Alias '@/x' da plataforma -> arquivo de destino
const ALIAS = {
  '@/lib/supabase': 'lib/supabase.js',
  '@/lib/presenceThrottle': 'lib/presenceThrottle.js',
};

// Ajustes do portal aplicados depois da conversão (arquivo de destino -> [de, para])
const PATCHES = {
  'voice/webrtc/SignalingChannel.js': [["`voice:${this.channelId}`", "`space:voice:${this.channelId}`"]],
};

const srcToOut = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [path.posix.join('', k.replace(/\.ts$/, '')), v]));

for (const [rel, outRel] of Object.entries(MAP)) {
  const code = fs.readFileSync(path.join(src, rel), 'utf8');
  const res = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: false,
      useDefineForClassFields: true,
      removeComments: false,
    },
    fileName: rel,
  });
  let js = res.outputText;
  const fromDir = path.posix.dirname(outRel);
  js = js.replace(/(from\s+|import\s+)'([^']+)'/g, (m, kw, spec) => {
    let target;
    if (ALIAS[spec]) target = ALIAS[spec];
    else if (spec.startsWith('.')) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      target = srcToOut[resolved];
      if (!target) throw new Error(`Import sem destino em ${rel}: ${spec}`);
    } else if (spec.startsWith('@/')) {
      throw new Error(`Alias não mapeado em ${rel}: ${spec}`);
    } else {
      return m; // pacote externo (não deveria existir aqui)
    }
    let r = path.posix.relative(fromDir, target);
    if (!r.startsWith('.')) r = './' + r;
    return `${kw}'${r}'`;
  });
  // Imports apenas de tipos viram 'export {}' vazio; remove linhas vazias de import
  js = js.replace(/^import\s+'[^']+';\s*$/gm, '');
  for (const [from, to] of PATCHES[outRel] || []) {
    if (!js.includes(from)) throw new Error(`Ajuste não aplicado em ${outRel}: ${from}`);
    js = js.split(from).join(to);
  }
  const header = `// Portado de Masayoshi-Plataforma/src/${rel} (TS -> JS automático). Ver docs/msy-space/README.md\n`;
  const outPath = path.join(outRoot, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + js);
  console.log('ok', outRel);
}
