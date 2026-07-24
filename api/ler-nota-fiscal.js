// Função serverless (Vercel) — lê um PDF/foto de nota fiscal ou cotação
// usando a API da Anthropic e devolve os dados estruturados em JSON.
// Requer a variável de ambiente ANTHROPIC_API_KEY configurada no projeto Vercel.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor. Peça ao administrador para configurar essa variável de ambiente no Vercel.' });
    return;
  }

  const { fileBase64, mimeType } = req.body || {};
  if (!fileBase64 || !mimeType) {
    res.status(400).json({ error: 'Envie fileBase64 e mimeType.' });
    return;
  }

  const tiposImagemAceitos = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const isPdf = mimeType === 'application/pdf';
  const isImagem = tiposImagemAceitos.includes(mimeType);
  if (!isPdf && !isImagem) {
    res.status(400).json({ error: 'Formato não suportado. Envie um PDF ou uma imagem (PNG/JPEG/WEBP).' });
    return;
  }

  const blocoArquivo = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } };

  const prompt = `Você está lendo uma nota fiscal ou cotação de compra de materiais odontológicos.
Extraia as informações e responda ESTRITAMENTE com um objeto JSON válido, sem markdown, sem crases, sem nenhum texto antes ou depois, no formato exato abaixo:

{
  "numero": "numero da nota fiscal ou cotacao, como string",
  "fornecedor": "nome do fornecedor/empresa vendedora",
  "data": "AAAA-MM-DD (data de emissao)",
  "itens": [
    {"produto": "nome/descricao do produto", "quantidade": 0, "valor_unitario": 0}
  ]
}

Regras importantes:
- Se houver mais de uma coluna de preço (ex: preço inicial e preço com desconto), use sempre o valor final/com desconto como valor_unitario.
- "quantidade" e "valor_unitario" devem ser números (não strings), usando ponto como separador decimal.
- Se não encontrar algum campo do cabeçalho, deixe como string vazia "".
- Inclua todos os itens da tabela de produtos, não pule nenhum.`;

  try {
    const resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: [blocoArquivo, { type: 'text', text: prompt }] }
        ]
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      res.status(500).json({ error: dados?.error?.message || 'Erro ao chamar a API da Anthropic' });
      return;
    }

    const textoResposta = (dados.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    const limpo = textoResposta.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(limpo);
    } catch (e) {
      res.status(500).json({ error: 'Não consegui interpretar a resposta da IA como JSON.', raw: textoResposta });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro inesperado ao processar o arquivo.' });
  }
};
