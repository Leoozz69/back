const express = require('express');
const mercadopago = require('mercadopago');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 10000;

// Configurando Mercado Pago com o token de acesso
mercadopago.configurations.setAccessToken('APP_USR-6293224342595769-100422-59d0a4c711e8339398460601ef894665-558785318');

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cors());

// Configuração do Socket.IO para verificar conexões
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Rota para criar o pagamento e gerar o QR code PIX
app.post('/generate_pix_qr', (req, res) => {
  const { name, amount, cpf, email } = req.body;

  let payment_data = {
    transaction_amount: amount,
    description: 'Doação para o projeto',
    payment_method_id: 'pix',
    notification_url: 'https://back-wag6.onrender.com/notifications', // URL de notificação
    payer: {
      first_name: name,
      last_name: 'Lindo',
      email: email || 'ogustadesigner@gmail.com',
      identification: {
        type: 'CPF',
        number: cpf || '56402807869'
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

// Rota para receber notificações de pagamento do Mercado Pago
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
        // Emitir evento para confirmar pagamento
        io.emit('paymentApproved');
        console.log('Pagamento aprovado! Evento emitido.');
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
