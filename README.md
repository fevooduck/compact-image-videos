# ⚡ Media Batch Optimizer (Imagens & Vídeos)

> Aplicação leve e de alta performance para redimensionamento e compactação em lote de imagens e vídeos direto no disco, preservando a estrutura completa de subpastas, nomes e formatos originais.

---

## 📖 Visão Geral

Ao trabalhar com grandes catálogos de e-commerce, banners ou galerias com centenas de arquivos organizados em diretórios, fazer upload manual pelo navegador é lento e impraticável.

Esta aplicação resolve esse problema com uma abordagem **local-first**:
1. Você adiciona os arquivos brutos dentro da pasta `origens/` (inclusive com subpastas).
2. Abre a interface no navegador (`http://localhost:3000`).
3. Define os limites máximos de largura, altura e qualidade.
4. O servidor processa os arquivos em lote direto no disco com bibliotecas de baixo nível (**Sharp** e **FFmpeg**), gravando os arquivos otimizados em `compact/` com a exata mesma hierarquia de diretórios.

---

## ✨ Recursos Principais

### 🖼️ Otimização de Imagens (via Sharp / libvips)
- **Redimensionamento Proporcional**: Limita largura e altura máxima preservando a proporção de tela (*aspect ratio*) sem distorção e sem *upscale* desnecessário.
- **Compressão Inteligente por Formato**:
  - `JPEG / JPG`: Compressão com algoritmo avançado `mozjpeg`.
  - `PNG`: Compressão nível 9 com paleta indexada otimizada.
  - `WebP`, `AVIF`, `TIFF`: Ajuste fino de qualidade preservando metadados essenciais.
- **Preservação de Formato**: Nomes e extensões originais são mantidos rigorosamente.

### 🎬 Otimização de Vídeos (via FFmpeg)
- **Remoção de Faixa de Áudio (Mudo)**: Opção de um clique para eliminar a trilha de som (`-an`), economizando drasticamente o peso do arquivo (perfeito para backgrounds de sites, banners e vitrines de produtos).
- **Seleção de Codecs Modernos**:
  - `H.264 / AVC`: O padrão ouro da web (reprodução garantida em 100% dos navegadores, iOS e Android).
  - `H.265 / HEVC`: Máxima eficiência para redução extrema de tamanho.
- **Controle de Qualidade (CRF)**: Escala de CRF 18 (altíssima fidelidade) a 32 (menor tamanho), com padrão 24 para equilíbrio ideal.
- **FastStart para Web**: Aplica automaticamente a flag `-movflags +faststart`, movendo os metadados para o cabeçalho do arquivo e permitindo streaming instantâneo sem precisar aguardar o download completo.
- **Dimensões Compatíveis**: Ajusta automaticamente resoluções para números pares (`trunc(iw/2)*2`), prevenindo erros comuns de codificação.

### 🛠️ Experiência & Infraestrutura
- **Preservação de Subpastas**: Se a imagem estiver em `origens/produtos/calcados/tenis.jpg`, a saída será exatamente em `compact/produtos/calcados/tenis.jpg`.
- **Filtro Automático do Sistema**: Ignora streams alternativos do Windows (como `*.Zone.Identifier`) e arquivos ocultos.
- **Feedback em Tempo Real (SSE)**: Acompanhe o percentual concluído, tamanho original vs compactado, porcentagem economizada e log de cada item processado.
- **Seleção Automática de Porta**: Se a porta `3000` estiver em uso por outro projeto, o servidor detecta o conflito (`EADDRINUSE`) e busca automaticamente a próxima porta livre (`3001`, `3002`...).
- **Design Studio (ProtoPie Theme)**: Interface limpa, minimalista e moderna inspirada no design system do ProtoPie, focada em produtividade.

---

## 📁 Estrutura do Projeto

```text
compact-images/
├── origens/            # 📥 Coloque aqui as imagens ou vídeos (aceita subpastas)
│   └── .gitkeep        # Mantém a pasta no repositório (conteúdo é ignorado pelo Git)
├── compact/            # 📤 Onde os arquivos compactados são gerados
│   └── .gitkeep        # Mantém a pasta no repositório (conteúdo é ignorado pelo Git)
├── public/             # 🎨 Interface Web
│   ├── index.html      # Estrutura da aplicação
│   ├── style.css       # Estilos e design tokens (ProtoPie Light Theme)
│   └── app.js          # Lógica de conexão em tempo real (SSE) e controles
├── server.js           # ⚙️ Servidor Node.js (Express, Sharp e FFmpeg)
├── package.json        # Dependências do projeto
├── .gitignore          # Ignora node_modules e a mídia local de origens/ e compact/
└── README.md           # Documentação completa
```

> **Sobre `origens/` e `compact/`**: as duas pastas fazem parte do repositório (via `.gitkeep`), mas **todo o conteúdo delas é ignorado pelo Git** — suas mídias nunca serão commitadas por acidente. Se as pastas não existirem, o servidor as cria automaticamente ao iniciar.

---

## 🚀 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior.
- Caso utilize Windows com WSL, execute os comandos no terminal do WSL (onde as ferramentas nativas de imagem/vídeo têm desempenho máximo).

### 1. Instalar as dependências
```bash
npm install
```
> O projeto inclui o pacote `ffmpeg-static`, portanto **não é necessário instalar o FFmpeg manualmente com permissões de root/sudo**.

### 2. Iniciar a aplicação
```bash
npm start
```

Você verá uma mensagem no terminal:
```text
======================================================
🚀 Compactador de Imagens & Vídeos iniciado!
👉 Acesse no navegador: http://localhost:3000
📂 Pasta Origens: /caminho/do/projeto/origens
📂 Pasta Compact: /caminho/do/projeto/compact
🎬 Suporte a Vídeo: FFmpeg integrado
======================================================
```

### 3. Abrir no Navegador
Acesse:
👉 **[http://localhost:3000](http://localhost:3000)** *(ou a porta informada caso a 3000 esteja ocupada)*

---

## 🎯 Passo a Passo de Uso

1. **Adicionar arquivos**: Copie suas fotos ou vídeos para a pasta `origens/`. Pode organizar em quantas subpastas desejar.
2. **Abrir a ferramenta**: No topo da tela, escolha a aba desejada:
   - **🖼️ Imagens**
   - **🎬 Vídeos**
3. **Ajustar os parâmetros**:
   - **Para Imagens**: Informe a Largura e Altura máxima (ex: `1200x1200px`) e o nível de qualidade desejado (ex: `80%`).
   - **Para Vídeos**: Escolha o Codec (H.264 recomendado), marque ou desmarque "Remover áudio", defina a resolução máxima e o nível CRF.
4. **Iniciar**: Clique no botão principal para iniciar o processamento.
5. **Acompanhar**: Veja a barra de progresso, a economia de espaço em tempo real e a lista detalhada de arquivos.
6. **Pronto!** Seus arquivos prontos para produção estarão disponíveis na pasta `compact/`.

---

## 📋 Formatos Suportados

| Tipo | Extensões Suportadas | Saída | Motor |
| :--- | :--- | :--- | :--- |
| **Imagens** | `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.tiff`, `.tif`, `.gif` | Mantém a extensão original | **Sharp** |
| **Vídeos** | `.mp4`, `.mov`, `.avi`, `.webm`, `.mkv`, `.m4v`, `.flv`, `.wmv` | `.mp4` otimizado para web | **FFmpeg** |

---

## ⚙️ Variáveis de Ambiente Opcionais

Caso deseje especificar uma porta padrão manualmente:
```bash
PORT=4000 npm start
```

---

## 🛠️ Tecnologias Utilizadas

- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Servidor Web**: [Express](https://expressjs.com/)
- **Processamento de Imagem**: [Sharp](https://sharp.pixelplumbing.com/) (baseado em libvips)
- **Processamento de Vídeo**: [FFmpeg Static](https://github.com/eugeneware/ffmpeg-static)
- **Streaming de Eventos**: Server-Sent Events (SSE) nativo
- **Front-end**: HTML5 semântico, CSS3 Moderno (Variáveis, Gradientes Radiais e Flexbox/Grid) e Vanilla JavaScript assíncrono.
