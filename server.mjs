import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const app = express();
app.use(express.json());
app.use(cors());

// ⚠️ COLE SEU ACCESS TOKEN DENTRO DAS ASPAS SIMPLES ABAIXO:
const ACCESS_TOKEN = 'APP_USR-7625542353139045-082616-c44e20382d21d1e4ad4b7a44a4e25026-283074046';

const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });

app.post('/api/criar-preferencia', async (req, res) => {
  try {
    const { itens, cliente } = req.body;

    if (!itens || itens.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

    // Monta a lista de itens para o Mercado Pago
    const mpItems = itens.map(item => {
      const personalizacao = item.personalizado && (item.nomeCostas || item.numero)
        ? ` [Personalizado: ${item.nomeCostas || '-'} / Nº ${item.numero || '-'}]`
        : '';

      return {
        id: String(item.produtoId),
        title: `${item.nome} - Tam ${item.tamanho}${personalizacao}`,
        quantity: 1,
        unit_price: Number(item.preco),
        currency_id: 'BRL',
        picture_url: item.imagem
      };
    });

    const preference = new Preference(client);

    const preferenceData = await preference.create({
      body: {
        items: mpItems,
        payer: {
          name: cliente?.nome || 'Cliente FK Collective',
        },
        back_urls: {
          success: 'https://seusite.com/sucesso',
          failure: 'https://seusite.com/erro',
          pending: 'https://seusite.com/pendente',
        },
        auto_return: 'approved',
        statement_descriptor: 'FK COLLECTIVE',
      }
    });

    // Envia o link de pagamento de volta para o site
    res.json({ init_point: preferenceData.init_point });
  } catch (error) {
    console.error('Erro ao gerar pagamento no Mercado Pago:', error);
    res.status(500).json({ error: 'Falha ao processar compra.' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 SERVIDOR LIGADO NA PORTA ${PORT}!`);
  console.log(`Aguardando pedidos do site...`);
  console.log(`========================================`);
});