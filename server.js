// Novo server.js com melhorias para garantir que cada pagamento seja identificado unicamente
const express = require('express');
const mercadopago = require('mercadopago');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');

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
app.use(cors({
  origin: 'https://fazopix1.netlify.app', // Permitir o domínio do frontend
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Configuração do Socket.IO para verificar conexões
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

let donationData = {}; // Variável para armazenar os dados da doação temporariamente

// Carregar dados salvos anteriormente (se existirem)
try {
  const rawData = fs.readFileSync('donationData.json');
  donationData = JSON.parse(rawData);
  console.log('Dados de doação carregados com sucesso.');
} catch (err) {
  console.log('Nenhum dado de doação pré-existente encontrado. Iniciando novo armazenamento.');
}

// Rota para criar o pagamento e gerar o QR code PIX
app.post('/generate_pix_qr', (req, res) => {
  const { name, amount, cpf, email } = req.body;

  if (!name || !amount) {
    return res.status(400).send('Nome e valor da doação são obrigatórios.');
  }

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
      const transactionId = response.body.id; // Obtém o ID da transação

      if (point_of_interaction && point_of_interaction.transaction_data) {
        const qrCodeBase64 = point_of_interaction.transaction_data.qr_code_base64;
        const pixCode = point_of_interaction.transaction_data.qr_code;

        // Armazenar os dados da doação incluindo o transactionId e socket.id
        donationData[transactionId] = {
          name,
          amount,
          cpf,
          email,
          socketId: req.body.socketId // Recebe o socketId do cliente
        };

        // Salvar dados no arquivo
        fs.writeFileSync('donationData.json', JSON.stringify(donationData, null, 2));
        console.log('Dados de doação armazenados e salvos para transactionId:', transactionId);

        // Enviar QR Code base64 e o código PIX para ser exibido na página
        res.json({ qr_code_base64: qrCodeBase64, pix_code: pixCode, transactionId });
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
      const transactionId = response.body.id;

      if (paymentStatus === 'approved' && donationData[transactionId]) {
        // Emitir evento para confirmar pagamento para o cliente correto
        const socketId = donationData[transactionId].socketId;
        io.to(socketId).emit('paymentApproved', donationData[transactionId]);
        console.log('Pagamento aprovado! Evento emitido para:', socketId);

        // Remover a transação da memória após o pagamento ser aprovado
        delete donationData[transactionId];
        // Atualizar o arquivo após a exclusão
        fs.writeFileSync('donationData.json', JSON.stringify(donationData, null, 2));
        console.log('Dados de doação removidos e atualizados no arquivo para transactionId:', transactionId);
      }

      res.sendStatus(200);
    })
    .catch(function (error) {
      console.error('Erro ao processar notificação:', error);
      res.sendStatus(500);
    });
});

// Rota para processar o envio dos dados do Discord
app.post('/send_discord_data', (req, res) => {
  const { discordNick, confirmationName, confirmationEmail, transactionId } = req.body;

  if (!discordNick || !confirmationName || !confirmationEmail || !transactionId) {
    res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    return;
  }

  // Garantir que os dados da doação estejam disponíveis
  const donation = donationData[transactionId];
  if (!donation) {
    res.status(400).json({ error: 'Valor da doação não encontrado. Por favor, tente novamente.' });
    return;
  }

  // Configurar transporte de e-mail usando Nodemailer
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'leolesane1234@gmail.com', // Seu e-mail
      pass: 'nnnj rdgl imoq njda' // Sua senha (use app passwords para maior segurança)
    }
  });

  let mailOptions = {
    from: 'leolesane1234@gmail.com',
    to: 'ogustadesigner@gmail.com',
    subject: 'Dados do Discord recebidos',
    text: `Nome: ${confirmationName}\nNick do Discord: ${discordNick}\nEmail: ${confirmationEmail}\nValor doado: R$${donation.amount.toFixed(2)}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erro ao enviar e-mail:', error);
      res.status(500).json({ error: 'Erro ao enviar os dados.' });
    } else {
      console.log('E-mail enviado:', info.response);
      // Emitir evento para confirmar envio dos dados ao cliente
      const socketId = donation.socketId;
      io.to(socketId).emit('discordDataSent', { message: 'Dados enviados com sucesso.' });
      // Somente deletar os dados depois que o e-mail for enviado com sucesso
      delete donationData[transactionId];
      fs.writeFileSync('donationData.json', JSON.stringify(donationData, null, 2));
      console.log('Dados de doação removidos após envio de e-mail para transactionId:', transactionId);
      res.status(200).json({ message: 'Dados enviados com sucesso.' });
    }
  });
});

// Inicializa o servidor
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
