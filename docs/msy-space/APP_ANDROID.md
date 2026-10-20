# App Android do MSY Space

## Por que um app
No celular, o **sistema** corta microfone e câmera de um *site* quando a pessoa sai dele (Android e iPhone).
Testado no portal (20/10/2026: "sai do site e a pessoa nem escuta, nem vê nada") e antes na Masayoshi-Plataforma
(TESTES.md §3.10). Um app instalado pode manter a chamada viva e abrir a janelinha flutuante — o site não.

## O que o app faz (0.1)
- Login com o **mesmo e-mail e senha do portal**. Só entra quem tem acesso ao Space (Diretoria ou permissão
  "Acessar o MSY Space" — checado no banco por `space_can_access()`).
- Lista as salas de voz do Space (fixas e com código), **Criar sala** e **Usar código**.
- Na sala: microfone, ensurdecer, **alto-falante × "do ouvido"** (📞/🔊), **câmera** (frontal/traseira), **transmitir a
  tela do celular**, sair; assiste transmissões e câmeras de quem está no site.
- **Câmeras no formato certo:** o quadro fica em pé ou deitado conforme a câmera; toque = **tela cheia**, e a tela gira
  sozinha para o formato do vídeo.
- **Segundo plano:** notificação fixa "Em chamada no MSY Space" (serviço em primeiro plano microfone + câmera + áudio)
  e tarefa "headless" que mantém o JavaScript vivo → a chamada continua com o app fora da tela.
- **Janelinha flutuante (Picture-in-Picture):** ao sair do app em chamada, a sala vira uma janela pequena por cima dos
  outros apps (Android 12+ entra sozinho; 8–11 ao apertar início). Se a permissão "Picture-in-picture" estiver
  desligada, o app pede para ligar e abre a tela certa das configurações. (Não usa "sobrepor a outros apps"
  — o Android tem a permissão própria de PiP, que é a usada pelo WhatsApp/Meet.)
- Aparece para quem está no site como qualquer participante (presença `space:online` e sala `space:voice:<id>`).
- Links `https://portalmsy.site/space.html?sala=CODIGO` podem abrir direto no app.

## Como funciona
- Projeto em `mobile/` (React Native 0.86 + `@livekit/react-native-webrtc` + `react-native-incall-manager`),
  copiado do app da Masayoshi-Plataforma (que já tinha segundo plano, PiP, câmera e orientação testados) e adaptado.
- **Mesma camada de chamada do site**: `mobile/metro.config.js` faz o app usar `js/space/voice/webrtc/*.js` e
  `js/space/lib/presenceThrottle.js`; o `lib/supabase.js` do site (que usa `window.MSY.db`) é trocado pelo cliente do
  app (`mobile/src/lib/supabase.ts`, sessão no aparelho, Realtime em JSON `vsn 1.0.0` — o binário não funciona no Hermes).
- Banco/RPCs do portal: `space_channels`, `space_create_room`, `space_join_room`, `space_touch_room`,
  `space_mark_room_empty`, Edge Function `turn-credentials`.
- Identificador `site.portalmsy.space` (instala ao lado do app da Masayoshi). Ícone = ícone do portal.
- Código nativo (Kotlin) em `mobile/android/app/src/main/java/br/com/masayoshi/plataforma/call/` (nome do pacote
  Kotlin herdado; não afeta nada): `CallService` (serviço + headless), `Pip` (janelinha), `CallServiceModule` (ponte JS).
- `.vercelignore` tira `mobile/` do deploy do site.

## Gerar o APK (neste PC)
```bash
cd mobile
npm install        # (node_modules já copiado do app da Plataforma)
npm run build:apk  # → mobile/apk/MSY-Space.apk
```
Sempre `npm run build:apk`: ele força refazer o pacote JS (`--rerun`), porque o Gradle não percebe mudanças em
`js/space/`. Requisitos já instalados: JDK 17, Android SDK em `%LOCALAPPDATA%\Android\Sdk`.

## Instalar no celular
1. Mandar `MSY-Space.apk` (WhatsApp, Drive, cabo). O APK é assinado com a chave de depuração (uso interno, fora da Play Store).
2. Abrir o arquivo → permitir "instalar apps desta fonte" só para isso.
3. Entrar com o e-mail e a senha do portal.
4. Primeira sala: permitir **microfone**, **notificações** e (se usar) **câmera**.
5. Se o app fechar sozinho em segundo plano (Xiaomi/Samsung/Motorola): Configurações do app → Bateria → **Sem restrições**
   (atalho na tela da sala).

## iPhone
Não tem app: publicar para iPhone exige conta paga da Apple (US$ 99/ano) e um Mac. Pelo site o iPhone fala, ouve e vê;
fora do Safari a câmera para (o site agora mostra a foto em vez de tela preta).

## Versões
| Versão | Data | Mudança |
|---|---|---|
| 0.3 | 20/10/2026 | Sua câmera não aparece mais espelhada (você se vê igual os outros te veem). Download pelo MSY Space |
| 0.2 | 20/10/2026 | Câmera em HD (720p, 30 fps, até 1 Mbps; antes 640×480 a 300 kbps) |
| 0.1 | 20/10/2026 | Primeira versão do MSY Space (base: app Masayoshi 0.9) + alto-falante/"do ouvido" |

## Download pelo MSY Space
- Botão verde **"Baixar app Android"** na coluna de canais do Space (some no iPhone). Gera um link assinado de 10 min
  para `space-app/MSY-Space.apk` no Storage do portal (bucket **privado**: só quem tem acesso ao Space baixa;
  só a gestão do Space envia versões — `supabase/migrations/20261020_space_app_download.sql`).
- `space-app/latest.json` = `{ version, size, date, sha256 }` → a versão aparece no botão.
- **Publicar versão nova:** `npm run build:apk` → enviar `MSY-Space.apk` (e atualizar `latest.json`) no bucket
  `space-app` logado como Diretoria. Pelo assistente: o upload do navegador aceita até 10 MB por vez, então o APK é
  dividido (`split -b 9000000`), as partes são juntadas na aba do portal, o SHA-256 é conferido e aí enviado.
- Limite do bucket: 50 MB (plano grátis). O APK tem ~47 MB; se passar disso, gerar só `arm64-v8a`
  (`-PreactNativeArchitectures=arm64-v8a`), que serve para praticamente todos os celulares atuais.
