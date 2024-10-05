const express = require('express');
const mercadopago = require('mercadopago');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Configurando Mercado Pago com token de maior de idade
mercadopago.configurations.setAccessToken('APP_USR-6293224342595769-100422-59d0a4c711e8339398460601ef894665-558785318');

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Adicionado para processar requisições de formulário

// Variável global para armazenar o valor doado
let donationAmount = 0;

// Rota para criar o pagamento e gerar o QR code PIX
app.post('/generate_pix_qr', (req, res) => {
  const { name, amount, cpf, email } = req.body;

  donationAmount = amount; // Armazena o valor da doação para uso posterior

  let payment_data = {
    transaction_amount: amount,
    description: 'Doação para o projeto',
    payment_method_id: 'pix',
    notification_url: 'https://back-wag6.onrender.com/notifications',
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
  const paymentId = req.body.data.id;

  mercadopago.payment.findById(paymentId)
    .then(function (response) {
      const paymentStatus = response.body.status;

      if (paymentStatus === 'approved') {
        io.emit('paymentApproved');
        console.log('Pagamento aprovado!');
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
  const { discordNick, confirmationName, confirmationEmail } = req.body;

  if (!discordNick || !confirmationName || !confirmationEmail) {
    res.status(400).send('Todos os campos são obrigatórios.');
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
    text: `Nome: ${confirmationName}\nNick do Discord: ${discordNick}\nEmail: ${confirmationEmail}\nValor doado: R$${donationAmount.toFixed(2)}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erro ao enviar e-mail:', error);
      res.status(500).send('Erro ao enviar os dados.');
    } else {
      console.log('E-mail enviado:', info.response);
      res.send('Dados enviados com sucesso.');
    }
  });
});

// Inicializa o servidor
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
