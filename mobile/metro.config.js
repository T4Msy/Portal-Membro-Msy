const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

/**
 * O app usa a MESMA camada de chamada do site do MSY Space (../js/space/voice/webrtc e
 * ../js/space/lib): mesma sinalização, mesmos slots de mídia, mesmas correções.
 *  - '@/features/voice/webrtc/X' → ../js/space/voice/webrtc/X.js
 *  - '@/lib/presenceThrottle'    → ../js/space/lib/presenceThrottle.js
 *  - o '../../lib/supabase.js' do site (que usa window.MSY.db) → cliente do app (src/lib/supabase.ts)
 */
const spaceDir = path.resolve(__dirname, '../js/space')
const appSupabase = path.resolve(__dirname, 'src/lib/supabase.ts')

const config = {
  watchFolders: [spaceDir],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('@/features/voice/webrtc/')) {
        return context.resolveRequest(context, path.join(spaceDir, 'voice/webrtc', `${moduleName.split('/').pop()}.js`), platform)
      }
      if (moduleName === '@/lib/presenceThrottle') {
        return context.resolveRequest(context, path.join(spaceDir, 'lib/presenceThrottle.js'), platform)
      }
      if (moduleName.startsWith('.') && context.originModulePath.startsWith(spaceDir)) {
        const target = path.resolve(path.dirname(context.originModulePath), moduleName)
        if (target === path.join(spaceDir, 'lib/supabase.js')) return context.resolveRequest(context, appSupabase, platform)
      }
      return context.resolveRequest(context, moduleName, platform)
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
