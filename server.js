const express = require('express');
const mercadopago = require('mercadopago');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 10000;

let donations = {}; // Objeto para armazenar os dados das doacoes, incluindo o socketId e o transactionId

// Configurando Mercado Pago com o token de acesso
mercadopago.configurations.setAccessToken('APP_USR-6293224342595769-100422-59d0a4c711e8339398460601ef894665-558785318');

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cors({
  origin: 'https://fazopix1.netlify.app', // Permitir o domínio do frontend
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Modificacao no evento de conexão
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    // Remova os dados de doacao associados ao cliente desconectado
    delete donations[socket.id];
  });
});

// Rota para criar o pagamento e gerar o QR code PIX
app.post('/generate_pix_qr', (req, res) => {
  const { name, amount, socketId } = req.body;

  if (!name || !amount || !socketId) {
    return res.status(400).send('Nome, valor da doacao e ID do socket são obrigatórios.');
  }

  let payment_data = {
    transaction_amount: amount,
    description: 'Doacao para o projeto',
    payment_method_id: 'pix',
    notification_url: 'https://back-wag6.onrender.com/notifications',
    payer: {
      first_name: name,
      last_name: 'Lindo',
      email: 'ogustadesigner@gmail.com',
      identification: {
        type: 'CPF',
        number: '56402807869'
      },
      address: {
        zip_code: '12345678',
        street_name: 'Rua Exemplo',
        street_number: '123'
      }
    }
  };

  mercadopago.payment.create(payment_data)
    .then(function (response) {
      const point_of_interaction = response.body.point_of_interaction;

      if (point_of_interaction && point_of_interaction.transaction_data) {
        const qrCodeBase64 = point_of_interaction.transaction_data.qr_code_base64;
        const pixCode = point_of_interaction.transaction_data.qr_code;
        const transactionId = response.body.id;

        // Salvar os dados da doacao associando ao cliente (socketId) e ao transactionId
        donations[transactionId] = {
          socketId,
          name,
          amount,
          qrCodeBase64,
          pixCode
        };

        // Enviar QR Code base64 e o código PIX para ser exibido na página
        res.json({ qr_code_base64: qrCodeBase64, pix_code: pixCode });
      } else {
        res.status(500).send('Erro ao gerar o QR Code PIX');
      }
    }).catch(function (error) {
      console.error('Erro ao criar o pagamento PIX:', error);
      res.status(500).send('Erro ao criar o pagamento PIX');
    });
});

// Rota para receber notificacoes de pagamento do Mercado Pago
app.post('/notifications', (req, res) => {
  const paymentId = req.body.data && req.body.data.id;

  if (!paymentId) {
    console.error('Erro: paymentId não encontrado na notificação.');
    return res.sendStatus(400);
  }

  mercadopago.payment.findById(paymentId)
    .then(function (response) {
      const paymentStatus = response.body.status;

      if (paymentStatus === 'approved') {
        // Verificar se existe uma doacao associada ao paymentId
        const donation = donations[paymentId];
        if (donation) {
          const { socketId } = donation;

          // Emitir evento para o cliente especifico
          io.to(socketId).emit('paymentApproved', donation);
          console.log('Pagamento aprovado! Evento emitido para:', socketId);
        } else {
          console.error('Erro: Doacao nao encontrada para o paymentId:', paymentId);
        }
      }

      res.sendStatus(200);
    })
    .catch(function (error) {
      console.error('Erro ao processar notificação:', error);
      res.sendStatus(500);
    });
});

// Inicializa o servidor
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
