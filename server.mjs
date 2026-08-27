import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Resend } from 'resend';

const app = express();
app.use(express.json());
app.use(cors());

// Configurações e Chaves
const ACCESS_TOKEN = 'APP_USR-7625542353139045-082616-c44e20382d21d1e4ad4b7a44a4e25026-283074046';
const EMAIL_NOTIFICACAO = 'seuemail@gmail.com'; // TODO: Coloque aqui o e-mail onde quer receber os avisos

const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================================================
   0. ROTA DE STATUS / PING (Mantém o Render sempre acordado)
========================================================= */
app.get('/', (req, res) => {
  res.status(200).send('Servidor FK Collective Ativo 🚀');
});

/* =========================================================
   1. CRIAÇÃO DE PREFERÊNCIA COM DADOS COMPLETOS
========================================================= */
app.post('/api/criar-preferencia', async (req, res) => {
  try {
    const { itens, cliente } = req.body;

    if (!itens || itens.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

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
          email: cliente?.email || 'cliente@email.com',
          phone: {
            number: cliente?.telefone || ''
          }
        },
        metadata: {
          cliente_nome: cliente?.nome || '',
          cliente_email: cliente?.email || '',
          cliente_telefone: cliente?.telefone || '',
          cliente_endereco: cliente?.endereco || '',
          resumo_itens: mpItems.map(i => i.title).join(' | ')
        },
        notification_url: 'https://servidor-mp.onrender.com/api/webhook',
        back_urls: {
          success: 'https://seusite.com/sucesso',
          failure: 'https://seusite.com/erro',
          pending: 'https://seusite.com/pendente',
        },
        auto_return: 'approved',
        statement_descriptor: 'FK COLLECTIVE',
      }
    });

    res.json({ init_point: preferenceData.init_point });
  } catch (error) {
    console.error('Erro ao gerar pagamento no Mercado Pago:', error);
    res.status(500).json({ error: 'Falha ao processar compra.' });
  }
});

/* =========================================================
   2. WEBHOOK AUTOMÁTICO - DISPARO DE E-MAIL
========================================================= */
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;

  res.sendStatus(200);

  if (type === 'payment' && data?.id) {
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
      });
      const payment = await response.json();

      if (payment.status === 'approved') {
        const metadata = payment.metadata || {};
        const valorFormatado = Number(payment.transaction_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: EMAIL_NOTIFICACAO,
          subject: `🛒 Nova Venda Aprovada! (${valorFormatado}) - ${metadata.cliente_nome || 'Cliente'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
              <h2 style="color: #D4AF37; margin-top: 0;">🎉 Nova Compra Confirmada!</h2>
              <p>O pagamento de um novo pedido foi aprovado pelo Mercado Pago.</p>
              
              <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;">
              
              <h3 style="margin-bottom: 8px;">Dados do Cliente:</h3>
              <p><strong>Nome:</strong> ${metadata.cliente_nome || payment.payer?.first_name || 'Não informado'}</p>
              <p><strong>E-mail:</strong> ${metadata.cliente_email || payment.payer?.email || 'Não informado'}</p>
              <p><strong>Telefone:</strong> ${metadata.cliente_telefone || 'Não informado'}</p>
              <p><strong>Endereço de Entrega:</strong> ${metadata.cliente_endereco || 'Não informado'}</p>

              <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;">

              <h3 style="margin-bottom: 8px;">Itens Comprados:</h3>
              <p style="background: #f9f9f9; padding: 10px; border-radius: 4px;">${metadata.resumo_itens || 'Camisa(s) selecionada(s)'}</p>

              <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;">

              <p><strong>Forma de Pagamento:</strong> ${payment.payment_type_id?.toUpperCase()} (${payment.payment_method_id?.toUpperCase()})</p>
              <p style="font-size: 18px;"><strong>Total Pago:</strong> <span style="color: #25D366; font-weight: bold;">${valorFormatado}</span></p>
              <p style="font-size: 12px; color: #888;">ID da Transação: ${payment.id}</p>
            </div>
          `
        });

        console.log(`E-mail de confirmação enviado para ${EMAIL_NOTIFICACAO}`);
      }
    } catch (err) {
      console.error('Erro ao processar envio do e-mail automático:', err);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});