# iaapc-chat-api

API serverless de chat do Instituto Abracar de Apoio aos Portadores de Cancer - IAAPC.

## Objetivo

Este projeto existe para manter o frontend React sem segredos e concentrar a integracao com IA em um backend separado.

Fluxo:

1. O React envia a mensagem para `POST /api/chat`.
2. Esta API chama o Gemini usando `GEMINI_API_KEY` no servidor.
3. A API devolve a resposta pronta para o chat do site.

## Estrutura

```text
api/
	chat.js
knowledge/
	faq.json
.env.example
package.json
```

## Variaveis de ambiente

Copie `.env.example` para `.env` no ambiente local ou configure as mesmas variaveis na plataforma de deploy.

- `GEMINI_API_KEY`: chave da API Gemini
- `GEMINI_MODEL`: modelo Gemini a ser usado pelo backend
- `ALLOWED_ORIGINS`: dominios permitidos para chamar a API, separados por virgula

Exemplo:

```env
GEMINI_API_KEY=<SUA_CHAVE>
GEMINI_MODEL=gemini-2.0-flash
ALLOWED_ORIGINS=https://iaapc.org.br,http://localhost:3000
```

## Executar validacao local

```bash
npm install
npm run check
```

## Endpoint

### `POST /api/chat`

Body:

```json
{
	"message": "Como o instituto pode me ajudar?",
	"history": [
		{
			"role": "user",
			"content": "Oi"
		},
		{
			"role": "assistant",
			"content": "Ola! Como posso ajudar?"
		}
	]
}
```

Resposta:

```json
{
	"answer": "..."
}
```

## Integracao no React

No frontend, chame a URL publicada desta API. Exemplo:

```js
const response = await fetch("https://SEU-DEPLOY.vercel.app/api/chat", {
	method: "POST",
	headers: {
		"Content-Type": "application/json"
	},
	body: JSON.stringify({
		message,
		history
	})
});

const data = await response.json();
```

## Base de conhecimento

As respostas institucionais sao reforcadas com o arquivo `knowledge/faq.json`.

Observacao importante: um Gem criado na interface do Gemini normalmente nao e exposto diretamente por esta API. Este backend usa a API Gemini com prompt institucional e base local para reproduzir o comportamento desejado do seu Gem.

Para expandir o conteudo, basta adicionar novas entradas no formato:

```json
{
	"question": "Pergunta",
	"answer": "Resposta"
}
```

## Deploy sugerido

Este projeto esta pronto para plataformas serverless em Node.js, como Vercel, Render ou Railway.

Se usar Vercel, a pasta `api/` ja sera tratada como funcoes serverless automaticamente.
