// server.js
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();

// Configuração do CORS - Liberado para todas as origens
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));

// Configuração da conexão com SQL Server
const config = {
  user: 'sa',
  password: 'L@gtech1100',
  server: '192.168.30.16',
  database: 'EXPERTOS',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Pool de conexões
let pool;

// Inicializar conexão
async function initDatabase() {
  try {
    pool = await sql.connect(config);
    console.log('Conectado ao SQL Server');
  } catch (err) {
    console.error('Erro ao conectar ao SQL Server:', err);
    process.exit(1);
  }
}

// Middleware para verificar conexão
async function checkConnection(req, res, next) {
  try {
    if (!pool || !pool.connected) {
      pool = await sql.connect(config);
    }
    next();
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro de conexão com o banco de dados',
      error: err.message
    });
  }
}

// ============================================
// ENDPOINTS
// ============================================

// 1. Consulta de Cliente por CNPJ (GET)
app.get('/api/cliente/:cnpj', checkConnection, async (req, res) => {
  try {
    const { cnpj } = req.params;

    if (!cnpj || cnpj.length !== 14) {
      return res.status(400).json({
        success: false,
        message: 'CNPJ inválido. Deve conter 14 caracteres.'
      });
    }

    const result = await pool.request()
      .input('cnpj', sql.VarChar(14), cnpj)
      .query(`
        SELECT id_cliente, cnpj, DESC_CLIENTE as Nome 
        FROM CLIENTE
        WHERE cnpj = @cnpj
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao consultar cliente',
      error: err.message
    });
  }
});

// 2. Criação de Cliente (POST)
app.post('/api/cliente', checkConnection, async (req, res) => {
  try {
    const { cnpj, nome } = req.body;

    if (!cnpj || !nome) {
      return res.status(400).json({
        success: false,
        message: 'CNPJ e Nome são obrigatórios'
      });
    }

    if (cnpj.length !== 14) {
      return res.status(400).json({
        success: false,
        message: 'CNPJ deve conter 14 caracteres'
      });
    }

    const result = await pool.request()
      .input('cnpj', sql.VarChar(14), cnpj)
      .input('nome', sql.VarChar(80), nome)
      .execute('Cadastra_Cliente');

    res.status(201).json({
      success: true,
      message: 'Cliente cadastrado com sucesso',
      data: result.recordset
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao cadastrar cliente',
      error: err.message
    });
  }
});

// 3. Consulta de Sistemas (GET)
app.get('/api/sistemas', checkConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .query(`
        SELECT DISTINCT
          s.ID_SISTEMA,
          s.DESC_SISTEMA as SISTEMA
        FROM SISTEMA s
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao consultar sistemas',
      error: err.message
    });
  }
});

// 4. Consulta de Rotinas por Sistema (GET)
app.get('/api/rotinas/:idsistema', checkConnection, async (req, res) => {
  try {
    const { idsistema } = req.params;

    if (!idsistema) {
      return res.status(400).json({
        success: false,
        message: 'ID do sistema é obrigatório'
      });
    }

    const result = await pool.request()
      .input('idsistema', sql.Int, parseInt(idsistema))
      .query(`
        SELECT DISTINCT
          ID_ROTINA,
          DESC_ROTINA as ROTINA
        FROM ROTINA
        WHERE ID_SISTEMA = @idsistema
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao consultar rotinas',
      error: err.message
    });
  }
});

// 5. Cabeçalho Painel de OS (GET)
app.get('/api/painel-os-cabecalho', checkConnection, async (req, res) => {
  try {
    const { dataini } = req.query;

    // Validação do parâmetro obrigatório
    if (!dataini) {
      return res.status(400).json({
        success: false,
        message: 'O parâmetro dataini é obrigatório',
        example: '/api/painel-os-cabecalho?dataini=2025-10-01'
      });
    }

    // Validação do formato de data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dataini)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de data inválido. Use o formato YYYY-MM-DD',
        example: 'dataini=2025-10-01'
      });
    }

    const query = `
      select
        (select count(ID_OS) from ORDEM_SERVICO where DT_OCORRENCIA >= @dataini and ID_STATUS <> 99) as QtdOS,
        (select count(ID_OS) from ORDEM_SERVICO where DT_OCORRENCIA >= @dataini and ID_STATUS = 5) as QtdFinalizada,
        (select count(ID_OS) from ORDEM_SERVICO where DT_OCORRENCIA >= @dataini and ID_STATUS in (2,88)) as QtdPendente,
        (select count(ID_OS) from ORDEM_SERVICO where DT_OCORRENCIA >= @dataini and ID_STATUS in (3)) as QtdDesenvolvimento
    `;

    const result = await pool.request()
      .input('dataini', sql.Date, dataini)
      .query(query);

    res.json({
      success: true,
      data: result.recordset[0],
      filtros: {
        dataini
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao consultar cabeçalho do painel de OS',
      error: err.message
    });
  }
});

// 6. Painel de OS (GET)
app.get('/api/painel-os', checkConnection, async (req, res) => {
  try {
    const { dataini, datafim } = req.query;

    // Validação dos parâmetros obrigatórios
    if (!dataini || !datafim) {
      return res.status(400).json({
        success: false,
        message: 'Os parâmetros dataini e datafim são obrigatórios',
        example: '/api/painel-os?dataini=2025-10-01&datafim=2025-10-31'
      });
    }

    // Validação do formato de data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dataini) || !dateRegex.test(datafim)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de data inválido. Use o formato YYYY-MM-DD',
        example: 'dataini=2025-10-01&datafim=2025-10-31'
      });
    }

    const query = `
      DECLARE
      @HoraInicio TIME = '08:00',
      @HoraFim TIME = '18:00';

      ;WITH DiasUteis AS (
        SELECT CAST(os.DT_OCORRENCIA AS DATETIME) AS Inicio,
          GETDATE() AS Fim,
          os.ID_OS,
          c.DESC_CLIENTE,
          os.TITULO,
          os.DT_OCORRENCIA,
          so.ID_STATUS,
          so.DESC_STATUS,
          case
            when coalesce(os.prioridade,4) = 4 then 'Baixa'
            when os.prioridade = 3 then 'Normal'
            when os.prioridade = 2 then 'Alta'
            else 'Urgente'
          end as Prioridade
        FROM ORDEM_SERVICO os
        JOIN CLIENTE c ON os.ID_CLIENTE = c.ID_CLIENTE
        JOIN STATUS_OS so ON os.ID_STATUS = so.ID_STATUS
        WHERE CAST(os.DT_OCORRENCIA AS DATE) between @dataini and @datafim
        AND so.ID_STATUS not in (5, 88, 99)
      )
      , DatasExpand AS (
        SELECT
          ID_OS, DESC_CLIENTE, TITULO, DT_OCORRENCIA, ID_STATUS, DESC_STATUS,
          DATEADD(DAY, v.number, CAST(DT_OCORRENCIA AS DATE)) AS Dia,
          @HoraInicio AS HoraInicio,
          @HoraFim AS HoraFim,
          DT_OCORRENCIA AS Inicio,
          GETDATE() AS Fim,
          Prioridade
        FROM DiasUteis d
        CROSS JOIN master.dbo.spt_values v
        WHERE v.type = 'P'
        AND DATEADD(DAY, v.number, CAST(DT_OCORRENCIA AS DATE)) <= CAST(GETDATE() AS DATE)
      )
      , HorasTrabalhadas AS (
        SELECT
          ID_OS, DESC_CLIENTE, TITULO, DT_OCORRENCIA, ID_STATUS, DESC_STATUS,
          SUM(
            CASE
              WHEN DATENAME(WEEKDAY, Dia) IN ('Saturday', 'Sunday') THEN 0
              ELSE
                DATEDIFF(SECOND,
                  CASE
                    WHEN CAST(Dia AS DATE) = CAST(DT_OCORRENCIA AS DATE)
                    THEN IIF(CAST(DT_OCORRENCIA AS TIME) > @HoraInicio, CAST(DT_OCORRENCIA AS TIME), @HoraInicio)
                    ELSE @HoraInicio
                  END,
                  CASE
                    WHEN CAST(Dia AS DATE) = CAST(GETDATE() AS DATE)
                    THEN IIF(CAST(GETDATE() AS TIME) < @HoraFim, CAST(GETDATE() AS TIME), @HoraFim)
                    ELSE @HoraFim
                  END
                )
            END
          ) AS SegundosUteis,
          Prioridade
        FROM DatasExpand
        GROUP BY ID_OS, DESC_CLIENTE, TITULO, DT_OCORRENCIA, ID_STATUS, DESC_STATUS, Prioridade
      )
      SELECT
        ID_OS,
        DESC_CLIENTE AS Cliente,
        TITULO,
        cast(DT_OCORRENCIA as date) AS Data_OS,
        ID_STATUS,
        DESC_STATUS AS Status,
        FORMATMESSAGE(
          '%dd %02d:%02d:%02d',
          SegundosUteis / 36000,
          (SegundosUteis % 36000) / 3600,
          (SegundosUteis % 3600) / 60,
          SegundosUteis % 60
        ) AS TempoAbertura,
        Prioridade
      FROM HorasTrabalhadas
      ORDER BY DT_OCORRENCIA;
    `;

    const result = await pool.request()
      .input('dataini', sql.Date, dataini)
      .input('datafim', sql.Date, datafim)
      .query(query);

    res.json({
      success: true,
      data: result.recordset,
      total: result.recordset.length,
      filtros: {
        dataini,
        datafim
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao consultar painel de OS',
      error: err.message
    });
  }
});

// 6. Criação de OS (POST)
app.post('/api/os', checkConnection, async (req, res) => {
  try {
    const {
      titulo,
      descricao,
      id_cliente,
      id_sistema,
      id_rotina,
      descricao_imagem,
      tipo,
      imagem
    } = req.body;

    if (!titulo || !descricao || !id_cliente || !id_sistema || !id_rotina) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: titulo, descricao, id_cliente, id_sistema, id_rotina'
      });
    }

    // Converter imagem base64 para buffer se existir
    let imagemBuffer = null;
    if (imagem) {
      const base64Data = imagem.replace(/^data:image\/\w+;base64,/, '');
      imagemBuffer = Buffer.from(base64Data, 'base64');
    }

    const request = pool.request()
      .input('titulo', sql.VarChar(200), titulo)
      .input('descricao', sql.VarChar(2000), descricao)
      .input('id_cliente', sql.Int, id_cliente)
      .input('id_sistema', sql.Int, id_sistema)
      .input('id_rotina', sql.Int, id_rotina)
      .input('descricao_imagem', sql.VarChar(150), descricao_imagem || null)
      .input('tipo', sql.VarChar(10), tipo || null)
      .input('imagem', sql.VarBinary, imagemBuffer);

    const result = await request.execute('Criar_OS');

    res.status(201).json({
      success: true,
      message: 'OS criada com sucesso',
      data: result.recordset
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao criar OS',
      error: err.message
    });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'API Expertos - SQL Server',
    endpoints: {
      'GET /api/cliente/:cnpj': 'Consultar cliente por CNPJ',
      'POST /api/cliente': 'Cadastrar novo cliente',
      'GET /api/sistemas': 'Listar todos os sistemas',
      'GET /api/rotinas/:idsistema': 'Listar rotinas por sistema',
      'GET /api/painel-os': 'Painel de Ordens de Serviço abertas',
      'POST /api/os': 'Criar nova OS'
    }
  });
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: err.message
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
  });
});

// Tratamento de encerramento gracioso
process.on('SIGINT', async () => {
  try {
    await pool.close();
    console.log('Conexão fechada');
    process.exit(0);
  } catch (err) {
    console.error('Erro ao fechar conexão:', err);
    process.exit(1);
  }
});