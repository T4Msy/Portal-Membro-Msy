# Correção do Bug de Renderização de Imagem no Jornal MSY

## Problema

Ao abrir uma matéria com imagem no modal de visualização do Jornal MSY (especialmente em mobile), a imagem não respeita os limites do container. Parte da imagem é exibida fora da área destinada à mídia, ficando cortada e deslocada para o canto inferior direito.

## Causa Raiz

O problema estava no CSS de várias classes que renderizam imagens com `position: absolute`, `left: 50%` e `top: 50%`, mas **sem `transform: translate(-50%, -50%)`** para centralizá-las.

Quando você usa `position: absolute` com `left: 50%` e `top: 50%`, o **canto superior esquerdo** do elemento é posicionado no centro do container. Sem o `transform: translate(-50%, -50%)` para compensar, o elemento fica deslocado para baixo e para a direita.

## Classes Corrigidas

### 1. `.journal-article-photo img` (jornal.css:790-802)
Imagem principal da matéria no modal de visualização.

**Antes:**
```css
.journal-article-photo img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  border-radius: 0;
  max-width: none;
  transform-origin: center;
}
```

**Depois:**
```css
.journal-article-photo img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  border-radius: 0;
  max-width: none;
  transform-origin: center;
  transform: translate(-50%, -50%);
}
```

### 2. `.journal-photo-pick-preview img` (jornal.css:1110-1120)
Preview da imagem ao selecionar uma foto para a matéria.

**Antes:**
```css
.journal-photo-pick-preview img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-width: none;
  transform-origin: center;
}
```

**Depois:**
```css
.journal-photo-pick-preview img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-width: none;
  transform-origin: center;
  transform: translate(-50%, -50%);
}
```

### 3. `.journal-crop-frame img` (jornal.css:1214-1225)
Imagem no frame de crop durante a edição.

**Antes:**
```css
.journal-crop-frame img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-width: none;
  transform-origin: center;
  will-change: transform;
}
```

**Depois:**
```css
.journal-crop-frame img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-width: none;
  transform-origin: center;
  will-change: transform;
  transform: translate(-50%, -50%);
}
```

### 4. `.journal-editor-paper-photo img` (jornal.css:1386-1399)
Preview da imagem no editor de matéria.

**Antes:**
```css
.journal-editor-paper-photo img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
  filter: none;
  max-width: none;
  transform-origin: center;
}
```

**Depois:**
```css
.journal-editor-paper-photo img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
  filter: none;
  max-width: none;
  transform-origin: center;
  transform: translate(-50%, -50%);
}
```

## Compatibilidade com Crop Ativo

Quando o crop está ativo, o JavaScript aplica um transform inline que sobrescreve o CSS:

```javascript
// jornal.js:670
const imgStyle = !meta.exported && meta.cropActive
  ? `transform:translate(calc(-50% + ${meta.crop.x}%), calc(-50% + ${meta.crop.y}%)) scale(${meta.crop.zoom})`
  : '';
```

Este transform inline já inclui `translate(-50%, -50%)` com ajustes para o crop, então a correção do CSS não interfere no comportamento do crop ativo.

## Classes Não Afetadas

As seguintes classes também usam `position: absolute` com `left: 50%` e `top: 50%`, mas já tinham o transform definido corretamente:

1. **`.media-editor-media`** - Usa `transform: var(--editor-transform)`, onde a variável é definida pelo JS com `translate(-50%, -50%)` incluído.

2. **`.post-media-edited`** - Usa `transform: var(--editor-transform, translate(calc(-50% + 0%), calc(-50% + 0%)) scale(1) rotate(0deg))`, com fallback que inclui o translate.

## Como Testar

### Teste Rápido
Abra o arquivo `test-image-rendering.html` no navegador para ver as correções em ação.

### Teste no Portal
1. Acesse o Jornal MSY no portal
2. Abra uma matéria que tenha imagem
3. Verifique se a imagem está centralizada no container
4. Teste em diferentes tamanhos de tela (especialmente mobile)
5. Teste o editor de matérias para verificar o preview da imagem
6. Teste o crop de imagem para garantir que ainda funciona corretamente

### Comportamento Esperado
- ✅ Imagem centralizada no container
- ✅ Imagem respeita os limites do container
- ✅ Proporção da imagem mantida (object-fit: contain)
- ✅ Crop ativo funciona corretamente com deslocamentos customizados
- ✅ Preview da imagem no editor centralizado
- ✅ Funciona em desktop e mobile

## Arquivos Modificados

- `/root/Portal-Membro-Msy/css/jornal.css` - 4 classes corrigidas

## Arquivos Criados (para teste)

- `/root/Portal-Membro-Msy/test-image-rendering.html` - Página de teste visual
- `/root/Portal-Membro-Msy/CORRECAO_BUG_IMAGEM.md` - Este documento
