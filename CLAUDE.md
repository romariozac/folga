# Folga: combinados deste repositório

## Publicar sem perguntar

Combinado com quem usa o app: toda mudança pronta e testada é publicada direto, sem perguntar antes.

1. Gerar o app: `cd codigo && node build.mjs`. Copiar `codigo/dist/index.html` e `codigo/dist/sw.js` para a raiz
   do repositório (o GitHub Pages publica a raiz do `main`; o resto de `dist/` só muda se mudar em `codigo/src`).
2. Testar o app gerado no navegador (Playwright), percorrendo a mudança, antes de publicar.
3. Commit no branch de trabalho, pull request e merge (squash) no `main`.
4. Conferir que o workflow "pages build and deployment" do `main` terminou com sucesso.
5. Atualizar o artefato do Claude "Folga — finanças sem culpa" com o mesmo `codigo/dist/index.html` e conferir que o
   sha256 publicado é igual ao do arquivo testado.
