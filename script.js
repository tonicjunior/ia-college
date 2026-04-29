// ─── GLOBALS & CONSTANTS ────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const STORAGE_KEY = "iaEad_v1_state";
const CERTIFICATE_KEY = "iaAcademy_v9_certificate_info";
const TUTORIAL_KEY = "iaEad_v1_tutorial_shown";
const THEME_KEY = "iaAcademy_theme_setting";
const ZOOM_KEY = "iaAcademy_zoom_level";
const API_MODE_KEY = "iaAcademy_api_mode";
const API_BACK_END = "https://academy01.app.n8n.cloud/webhook/academy";
const SHOW_SUPPORT = true;

const LANGUAGE_PREFS_KEY = "iaAcademy_lang_prefs";

function getLangPrefs() {
  const raw = localStorage.getItem(LANGUAGE_PREFS_KEY);
  return raw
    ? JSON.parse(raw)
    : { questionsInContentLang: true, answersInContentLang: true };
}
function saveLangPrefs(prefs) {
  localStorage.setItem(LANGUAGE_PREFS_KEY, JSON.stringify(prefs));
}

let _pendingPromptContext = null;
let appState = {};
let currentZoomLevel = 1;
let onManualResponseSubmit = null;
let isSubmitting = false;
let generatedCertificateUrl = null;
let generatedCertificateName = null;

// ─── PROMPTS ─────────────────────────────────────────────────────────────────
const PROMPTS = {
  SIMULADO: (langPrefs = {}) => {
    const qLang =
      langPrefs.questionsInContentLang !== false
        ? "As PERGUNTAS devem ser escritas no mesmo idioma do conteudo fornecido pelo aluno."
        : "As PERGUNTAS devem ser escritas em Portugues Brasileiro, independentemente do idioma do conteudo.";
    const aLang =
      langPrefs.answersInContentLang !== false
        ? "As RESPOSTAS ESPERADAS (expectedKeyPoints e sampleAnswer) devem ser no mesmo idioma do conteudo."
        : "As RESPOSTAS ESPERADAS (expectedKeyPoints e sampleAnswer) devem ser em Portugues Brasileiro.";
    return (
      "Voce e um avaliador academico experiente especializado em provas de EAD universitario.\n" +
      "Sua missao e criar um simulado completo, desafiador e bem elaborado com base EXCLUSIVAMENTE no conteudo fornecido pelo aluno.\n\n" +
      "ATENCAO CRITICA - JSON PURO:\n" +
      "- A resposta DEVE ser um objeto JSON puro e valido. ZERO texto externo, ZERO blocos markdown, ZERO backticks.\n" +
      "- NUNCA use caracteres invisiveis, espacos de largura zero, quebras de linha especiais (\\u2028, \\u2029) ou qualquer caractere Unicode de controle dentro das strings JSON.\n" +
      "- Todas as strings devem conter apenas texto legivel. O JSON sera analisado diretamente - qualquer caractere invalido quebra a ferramenta.\n" +
      '- Escape corretamente: aspas com \\\\", quebras de linha com \\\\n, barras com \\\\\\\\.\n\n' +
      "IDIOMA:\n" +
      "- " +
      qLang +
      "\n" +
      "- " +
      aLang +
      "\n\n" +
      "ESTRUTURA OBRIGATORIA:\n" +
      JSON.stringify(
        {
          unitTitle: "Titulo sugerido para a unidade com base no conteudo",
          questions: [
            {
              id: 1,
              type: "multiple_choice",
              question: "Texto da pergunta",
              options: [
                { id: "A", text: "..." },
                { id: "B", text: "..." },
                { id: "C", text: "..." },
                { id: "D", text: "..." },
              ],
              correctAnswer: "B",
              cognitiveLevel: "recall|comprehension|application|analysis",
              explanation:
                "Por que esta e a resposta correta, explicado brevemente.",
            },
            {
              id: 16,
              type: "discursive",
              question: "Texto da pergunta discursiva",
              expectedKeyPoints: [
                "ponto 1 esperado",
                "ponto 2 esperado",
                "ponto 3 esperado",
              ],
              keyPointWeights: [0.4, 0.35, 0.25],
              sampleAnswer:
                "Resposta modelo completa e bem elaborada para referencia da IA avaliadora.",
            },
          ],
        },
        null,
        2,
      ) +
      "\n\n" +
      "DISTRIBUICAO OBRIGATORIA DAS 20 QUESTOES:\n" +
      "- Questoes 1-15: MULTIPLA ESCOLHA (type: 'multiple_choice')\n" +
      "- Questoes 16-20: DISCURSIVAS (type: 'discursive')\n\n" +
      "DISTRIBUICAO COGNITIVA DAS 15 MULTIPLA ESCOLHA:\n" +
      "- 2 de RECALL: identificacao direta de conceito ou definicao\n" +
      "- 4 de COMPREENSAO: o aluno explica, distingue ou reformula\n" +
      "- 5 de APLICACAO: cenario novo que exige aplicar o conhecimento estudado\n" +
      "- 4 de ANALISE: identificar causas, comparar abordagens, avaliar decisoes\n\n" +
      "REGRAS DE QUALIDADE:\n" +
      "1. BASE: use APENAS informacoes presentes no conteudo fornecido. Nao invente dados.\n" +
      "2. DISTRATORES: cada distrator incorreto deve representar um erro de raciocinio real. Devem ser plausíveis para quem nao estudou bem.\n" +
      "3. DISCURSIVAS: cada questao deve exigir resposta com pelo menos 3 pontos. Em keyPointWeights, forneça pesos decimais que somam 1.0, indicando a importancia relativa de cada ponto.\n" +
      "4. NIVEL: equivalente a prova de faculdade EAD. Nao infantilize.\n" +
      "5. VARIEDADE: comparacoes, casos hipoteticos, analise de situacoes, erro de raciocinio para identificar.\n\n" +
      "INPUT QUE VOCE RECEBERA:\n" +
      '{ "courseName": "...", "unitNumber": N, "unitContent": "conteudo completo colado pelo aluno" }'
    );
  },

  AVALIADOR_DISCURSIVO: (langPrefs = {}) => {
    const feedbackLang =
      langPrefs.answersInContentLang !== false
        ? "O feedback deve ser escrito no mesmo idioma do conteudo/questao."
        : "O feedback deve ser escrito em Portugues Brasileiro.";
    return (
      "Voce e um professor avaliador universitario. Sua missao e avaliar as respostas discursivas de um aluno com rigor e justica, baseando-se exclusivamente no conteudo de referencia fornecido.\n\n" +
      "ATENCAO CRITICA - JSON PURO:\n" +
      "- A resposta DEVE ser um objeto JSON puro e valido. ZERO texto externo, ZERO blocos markdown, ZERO backticks.\n" +
      "- NUNCA use caracteres invisiveis, espacos de largura zero, quebras de linha especiais (\\u2028, \\u2029) ou qualquer caractere Unicode de controle dentro das strings JSON.\n" +
      "- O JSON sera analisado diretamente - qualquer caractere invalido quebra a ferramenta.\n\n" +
      "IDIOMA DO FEEDBACK: " +
      feedbackLang +
      "\n\n" +
      "ESTRUTURA:\n" +
      JSON.stringify(
        {
          evaluations: [
            {
              questionId: 16,
              score: 7,
              maxScore: 10,
              status: "approved|partial|reproved",
              feedback:
                "Feedback detalhado sobre o que o aluno acertou e o que faltou na resposta.",
              missingPoints: ["ponto que faltou 1", "ponto que faltou 2"],
            },
          ],
          totalDiscursiveScore: 35,
          maxDiscursiveScore: 50,
          overallDiscursiveFeedback:
            "Comentario geral sobre o desempenho nas discursivas.",
        },
        null,
        2,
      ) +
      "\n\n" +
      "SISTEMA DE PONTUACAO PONDERADA:\n" +
      "- Cada questao discursiva vale 10 pontos no total.\n" +
      "- Cada questao possui expectedKeyPoints e keyPointWeights (pesos decimais que somam 1.0).\n" +
      "- Para cada ponto-chave, avalie se o aluno o cobriu: completamente (100% do peso), parcialmente (50% do peso) ou nao cobriu (0%).\n" +
      "- Some os pontos ponderados para obter a nota (0-10). Arredonde para o inteiro mais proximo.\n" +
      "- Exemplo: pesos [0.4, 0.35, 0.25], cobriu completamente o 1o, parcialmente o 2o e nao cobriu o 3o: 10*(0.4*1 + 0.35*0.5 + 0.25*0) = 5.75 => 6.\n\n" +
      "STATUS por nota final:\n" +
      "- 'approved': 7-10 pontos.\n" +
      "- 'partial': 4-6 pontos.\n" +
      "- 'reproved': 0-3 pontos.\n\n" +
      "REGRAS DE AVALIACAO:\n" +
      "1. Priorize os pontos de maior peso - eles representam os conceitos centrais da questao.\n" +
      "2. O feedback deve ser construtivo: aponte o que o aluno acertou ANTES de apontar o que faltou.\n" +
      "3. Nao penalize por ortografia ou gramatica, apenas pelo conteudo conceitual.\n" +
      "4. Compare a resposta do aluno com expectedKeyPoints e sampleAnswer para avaliar.\n" +
      "5. totalDiscursiveScore = soma dos scores. maxDiscursiveScore = 10 x numero de questoes discursivas.\n\n" +
      "INPUT QUE VOCE RECEBERA:\n" +
      '{\n  "learningContext": "conteudo original da unidade",\n  "discursiveAnswers": [\n    {\n      "questionId": 16,\n      "question": "texto da questao",\n      "studentAnswer": "resposta do aluno",\n      "expectedKeyPoints": [...],\n      "keyPointWeights": [...],\n      "sampleAnswer": "resposta modelo"\n    }\n  ]\n}'
    );
  },
};

function getPrompt(requestType, langPrefs) {
  const p = PROMPTS[requestType];
  return typeof p === "function" ? p(langPrefs || getLangPrefs()) : p;
}

const PROMPT_TITLES = {
  SIMULADO: "Gerando Simulado da Unidade...",
  AVALIADOR_DISCURSIVO: "Avaliando Respostas Discursivas...",
};

// ─── TUTORIAL ────────────────────────────────────────────────────────────────
const tutorialSteps = [
  {
    title: "Bem-vindo(a) ao IA.Academy EAD!",
    content:
      "Este é o seu assistente de simulados para disciplinas EAD. Cadastre suas disciplinas, cole os conteúdos das unidades e gere simulados completos com gabarito automático.",
  },
  {
    title: "1. Cadastre sua Disciplina",
    content:
      "Clique em <strong>Cadastrar Disciplina</strong>, informe o nome do curso, a quantidade de unidades e cole o conteúdo de cada unidade (copie diretamente do material da faculdade).",
  },
  {
    title: "2. Gere os Simulados",
    content:
      "A IA cria automaticamente <strong>20 questões por unidade</strong>: 15 de múltipla escolha (com gabarito) e 5 discursivas (avaliadas pela IA após envio).",
  },
  {
    title: "3. Faça o Simulado",
    content:
      "Responda todas as questões e envie. As questões de múltipla escolha são corrigidas imediatamente. As discursivas são analisadas pela IA com feedback detalhado.",
  },
  {
    title: "4. Conclua e Certifique-se",
    content:
      "Ao completar todas as unidades, você ganha um <strong>Certificado de Conclusão</strong> que pode ser baixado como imagem.",
  },
  {
    title: "Tudo Pronto!",
    content:
      "Agora cadastre sua primeira disciplina e comece a se preparar para as provas. Bons estudos!",
  },
];
let currentTutorialStep = 0;

// ─── STATE ───────────────────────────────────────────────────────────────────
function loadState() {
  const s = localStorage.getItem(STORAGE_KEY);
  appState = s
    ? JSON.parse(s)
    : { activeCourseId: null, activeUnitIndex: 0, courses: {} };
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}
function getActiveCourse() {
  return appState.courses[appState.activeCourseId] || null;
}
function getActiveUnit() {
  const c = getActiveCourse();
  if (!c) return null;
  return c.units[appState.activeUnitIndex] || null;
}

// ─── THEME / ZOOM ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.classList.add("light");
    const ts = $("#theme-switch");
    if (ts) ts.checked = false;
  } else {
    document.documentElement.classList.remove("light");
    const ts = $("#theme-switch");
    if (ts) ts.checked = true;
  }
}
function applyZoom() {
  document.body.style.zoom = currentZoomLevel;
  const el = $("#zoom-level-display");
  if (el) el.textContent = Math.round(currentZoomLevel * 100) + "%";
  localStorage.setItem(ZOOM_KEY, currentZoomLevel);
}
function initSettings() {
  const theme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(theme);
  const apiMode = localStorage.getItem(API_MODE_KEY) === "true";
  const t1 = $("#api-mode-toggle");
  if (t1) t1.checked = apiMode;
  const t2 = $("#api-mode-switch-settings");
  if (t2) t2.checked = apiMode;
  const zoom = localStorage.getItem(ZOOM_KEY);
  if (zoom) currentZoomLevel = parseFloat(zoom);
  applyZoom();
  updateModeLabels();

  // Inicializa toggles de idioma
  const langPrefs = getLangPrefs();
  const tq = $("#lang-questions-switch");
  if (tq) tq.checked = langPrefs.questionsInContentLang !== false;
  const ta = $("#lang-answers-switch");
  if (ta) ta.checked = langPrefs.answersInContentLang !== false;
}
function updateModeLabels() {
  const isApi = localStorage.getItem(API_MODE_KEY) === "true";
  const m1 = $("#mode-label-manual");
  const m2 = $("#mode-label-api");
  if (m1) m1.classList.toggle("active", !isApi);
  if (m2) m2.classList.toggle("active", isApi);
}

// ─── SCREEN MANAGEMENT ───────────────────────────────────────────────────────
function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.add("hidden"));
  const el = $(`#${id}`);
  if (el) el.classList.remove("hidden");
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function renderDashboard() {
  appState.activeCourseId = null;
  saveState();
  const container = $("#courses-container");
  const wrapper = $("#courses-wrapper");
  container.innerHTML = "";
  const courses = Object.values(appState.courses).sort(
    (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0),
  );
  if (courses.length === 0) {
    wrapper.classList.add("hidden");
  } else {
    wrapper.classList.remove("hidden");
    const countEl = $("#courses-count");
    if (countEl) countEl.textContent = `(${courses.length})`;
    courses.forEach((course) => {
      const total = course.units.length;
      const done = course.units.filter((u) => u.completed).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const card = document.createElement("div");
      card.className = "course-card";
      card.dataset.courseId = course.id;
      card.innerHTML = `
        <div class="course-card-header">
          <div class="course-card-title">${course.name}</div>
          <span class="course-card-discipline">${course.units.length} unid.</span>
        </div>
        <div class="course-card-stats">
          <span class="stat-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            ${done}/${total} concluídas
          </span>
          <span class="stat-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${course.createdAt ? new Date(course.createdAt).toLocaleDateString("pt-BR") : ""}
          </span>
        </div>
        <div class="progress-row"><span>Progresso</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="course-card-footer">
          <button class="btn btn-primary" style="flex:1;" data-action="open" data-course-id="${course.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            ${done === total ? "Ver Resultados" : "Acessar Simulados"}
          </button>
          <button class="delete-course-btn" data-course-id="${course.id}" title="Apagar disciplina">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>`;
      container.appendChild(card);
    });
  }
  showScreen("dashboard-section");
}

// ─── COURSE REGISTRATION MODAL ────────────────────────────────────────────────
function buildUnitFields(count) {
  const container = $("#units-config-container");
  container.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const div = document.createElement("div");
    div.className = "unit-config-item";
    div.innerHTML = `
      <div class="unit-config-header">
        <span class="unit-config-number">${i}</span>
        <span class="unit-config-label">Unidade ${i}</span>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Conteúdo da Unidade ${i}</label>
        <textarea id="unit-content-${i}" placeholder="Cole aqui o conteúdo completo da Unidade ${i} (pode incluir resumos, tópicos, textos do livro, anotações de aula...)" rows="5"></textarea>
        <small>Quanto mais conteúdo, melhores e mais precisas serão as questões.</small>
      </div>`;
    container.appendChild(div);
  }
}

function openRegisterModal() {
  $("#reg-course-name").value = "";
  $("#reg-units-count").value = "4";
  buildUnitFields(4);
  $("#register-modal").classList.remove("hidden");
}

async function handleRegisterSubmit() {
  if (isSubmitting) return;
  const name = $("#reg-course-name").value.trim();
  if (!name) {
    await showConfirmationModal(
      "Campo obrigatório",
      "Informe o nome da disciplina.",
      {
        confirmText: "OK",
        showCancel: false,
      },
    );
    return;
  }
  const count = parseInt($("#reg-units-count").value);
  const units = [];
  for (let i = 1; i <= count; i++) {
    const content = ($(`#unit-content-${i}`)?.value || "").trim();
    if (!content) {
      await showConfirmationModal(
        "Campo obrigatório",
        `Preencha o conteúdo da Unidade ${i}.`,
        { confirmText: "OK", showCancel: false },
      );
      return;
    }
    units.push({
      number: i,
      content,
      title: `Unidade ${i}`,
      simulado: null,
      completed: false,
      result: null,
      draftAnswers: {},
    });
  }

  if (localStorage.getItem(API_MODE_KEY) === "true") {
    showSupportModal();
    return;
  }

  isSubmitting = true;
  $("#register-submit-btn").disabled = true;
  $("#register-modal").classList.add("hidden");

  const courseId = "course-" + Date.now();
  const course = {
    id: courseId,
    name,
    units,
    completed: false,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
  };
  appState.courses[courseId] = course;
  appState.activeCourseId = courseId;
  saveState();

  const langPrefs = getLangPrefs();

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const payload = {
      courseName: name,
      unitNumber: unit.number,
      unitContent: unit.content,
    };
    await processRequest("SIMULADO", {
      history: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      langPrefs,
      onSuccess: (data) => {
        unit.title = data.unitTitle || `Unidade ${unit.number}`;
        unit.simulado = data.questions;
        saveState();
      },
    });
  }

  isSubmitting = false;
  $("#register-submit-btn").disabled = false;

  // Redireciona direto para o curso recém-criado
  selectCourse(courseId);
}

// ─── SIMULADO SCREEN ─────────────────────────────────────────────────────────
function selectCourse(id) {
  appState.activeCourseId = id;
  const course = appState.courses[id];
  if (!course) return renderDashboard();
  course.lastAccessed = Date.now();
  // Find first incomplete unit
  const firstIncomplete = course.units.findIndex((u) => !u.completed);
  appState.activeUnitIndex = firstIncomplete >= 0 ? firstIncomplete : 0;
  saveState();
  renderSimuladoScreen();
}

function renderSimuladoScreen() {
  const course = getActiveCourse();
  if (!course) return renderDashboard();

  // Sidebar
  const titleEl = $("#sidebar-course-title");
  if (titleEl) titleEl.textContent = course.name;
  const discEl = $("#sidebar-course-discipline");
  if (discEl) discEl.textContent = `${course.units.length} unidades`;
  const mobileTitle = $("#mobile-course-title");
  if (mobileTitle) mobileTitle.textContent = course.name;

  const done = course.units.filter((u) => u.completed).length;
  const pct =
    course.units.length > 0
      ? Math.round((done / course.units.length) * 100)
      : 0;
  const pctEl = $("#sidebar-progress-pct");
  if (pctEl) pctEl.textContent = pct + "%";
  const fillEl = $("#sidebar-progress-fill");
  if (fillEl) fillEl.style.width = pct + "%";

  const list = $("#units-list");
  list.innerHTML = "";
  course.units.forEach((unit, idx) => {
    const li = document.createElement("div");
    li.className = "unit-item";
    const isActive = idx === appState.activeUnitIndex;
    const isLocked =
      idx > 0 && !course.units[idx - 1].completed && !unit.completed;
    if (isActive) li.classList.add("active");
    if (unit.completed) li.classList.add("completed");
    if (isLocked) li.classList.add("locked");

    const score = unit.result ? Math.round(unit.result.totalScore) : null;
    li.innerHTML = `
      <div class="unit-icon">${unit.completed ? "✓" : idx + 1}</div>
      <div class="unit-item-info">
        <div class="unit-item-title">${unit.title}</div>
        <div class="unit-item-status">${unit.completed ? `Nota: ${score}%` : isLocked ? "Bloqueada" : unit.simulado ? "Pronto para iniciar" : "Gerando..."}</div>
      </div>`;
    if (!isLocked) li.onclick = () => selectUnit(idx);
    list.appendChild(li);
  });

  showScreen("simulado-section");
  renderUnitView();
}

function selectUnit(idx) {
  appState.activeUnitIndex = idx;
  saveState();
  renderSimuladoScreen();
  if (window.innerWidth <= 768) {
    $("#sim-sidebar").classList.remove("open");
    $("#sidebar-overlay").classList.remove("active");
  }
}

function renderUnitView() {
  const unit = getActiveUnit();
  const course = getActiveCourse();
  const content = $("#sim-content");
  if (!unit) {
    content.innerHTML = "";
    return;
  }

  if (unit.completed && unit.result) {
    renderResultView(unit, course);
    return;
  }

  if (!unit.simulado) {
    const isApiMode = localStorage.getItem(API_MODE_KEY) === "true";
    content.innerHTML = `
      <div class="sim-header">
        <div class="sim-breadcrumb">${course.name} <span>›</span> Unidade ${unit.number}</div>
        <h1 class="sim-title">${unit.title}</h1>
      </div>
      <div class="unit-detail-card" style="text-align:center;padding:2.5rem 2rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">📋</div>
        <h3 style="margin-bottom:0.5rem;">Simulado não gerado ainda</h3>
        <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.5rem;">
          ${
            isApiMode
              ? "O modo API está ativo. Para gerar simulados, apoie o projeto."
              : "Clique abaixo para gerar as questões desta unidade via Modo Manual."
          }
        </p>
        <button class="btn btn-primary" id="gen-unit-simulado-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
          </svg>
          ${isApiMode ? "Apoiar o Projeto" : "Gerar Simulado desta Unidade"}
        </button>
      </div>`;
    $("#gen-unit-simulado-btn").onclick = async () => {
      if (localStorage.getItem(API_MODE_KEY) === "true") {
        showSupportModal();
        return;
      }
      const langPrefs = getLangPrefs();
      const payload = {
        courseName: course.name,
        unitNumber: unit.number,
        unitContent: unit.content,
      };
      await processRequest("SIMULADO", {
        history: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        langPrefs,
        onSuccess: (data) => {
          unit.title = data.unitTitle || `Unidade ${unit.number}`;
          unit.simulado = data.questions;
          saveState();
          renderSimuladoScreen();
        },
      });
    };
    return;
  }

  content.innerHTML = `
    <div class="sim-header">
      <div class="sim-breadcrumb">${course.name} <span>›</span> Unidade ${unit.number}</div>
      <h1 class="sim-title">${unit.title}</h1>
      <div class="sim-meta">
        <span class="sim-badge blue">20 questões</span>
        <span class="sim-badge purple">5 discursivas</span>
        <span class="sim-badge green">15 múltipla escolha</span>
      </div>
    </div>
    <div class="unit-detail-card">
      <h3>Conteúdo da Unidade</h3>
      <div class="unit-content-preview"><p>${unit.content}</p></div>
      <p style="color:var(--text-muted);font-size:0.88rem;margin-top:0.8rem;">
        Leia o conteúdo acima antes de iniciar. O simulado contém 15 questões de múltipla escolha e 5 questões discursivas, todas baseadas neste conteúdo.
      </p>
    </div>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
      <button class="btn btn-primary" id="start-simulado-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        Iniciar Simulado
      </button>
    </div>`;
  $("#start-simulado-btn").onclick = () => renderQuizForm(unit, course);
}

// ─── QUIZ FORM ────────────────────────────────────────────────────────────────
function renderQuizForm(unit, course) {
  const content = $("#sim-content");
  const questions = unit.simulado;
  const total = questions.length;

  // Garante o objeto de rascunho
  if (!unit.draftAnswers) unit.draftAnswers = {};

  let html = `
    <div class="sim-header">
      <div class="sim-breadcrumb">${course.name} <span>›</span> ${unit.title}</div>
      <h1 class="sim-title">Simulado — ${unit.title}</h1>
    </div>
    <div class="quiz-progress-bar">
      <div class="progress-bar"><div class="progress-fill" style="width:0%" id="quiz-progress-fill"></div></div>
      <span class="quiz-progress-label" id="quiz-progress-label">0 / ${total}</span>
    </div>
    <form id="quiz-form">`;

  questions.forEach((q) => {
    const isDisc = q.type === "discursive";
    html += `
      <div class="question-card ${isDisc ? "discursive" : "multipla"}" id="qcard-${q.id}">
        <div class="question-number">
          <span>Questão ${q.id}</span>
          <span class="q-type-badge ${isDisc ? "q-type-disc" : "q-type-mc"}">${isDisc ? "Discursiva" : "Múltipla Escolha"}</span>
        </div>
        <div class="question-text">${q.question}</div>`;

    if (isDisc) {
      const savedText = unit.draftAnswers[`disc_${q.id}`] || "";
      // value via atributo não funciona bem para textarea no innerHTML; usamos data-attr
      html += `<textarea class="discursive-answer" name="disc_${q.id}" id="disc_${q.id}" placeholder="Escreva sua resposta aqui. Seja claro(a) e aborde os pontos principais do conteúdo..." rows="5" data-saved="${encodeURIComponent(savedText)}"></textarea>`;
    } else {
      const savedMC = unit.draftAnswers[`mc_${q.id}`] || null;
      html += `<div class="options-list">`;
      q.options.forEach((opt) => {
        const checked = savedMC === opt.id ? "checked" : "";
        html += `
          <label class="option-item${savedMC === opt.id ? " selected" : ""}" id="opt-${q.id}-${opt.id}">
            <input type="radio" name="mc_${q.id}" value="${opt.id}" ${checked} />
            <span class="option-letter">${opt.id}</span>
            <span class="option-text">${opt.text}</span>
          </label>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });

  html += `
    </form>
    <div style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
      <button class="btn btn-primary" id="submit-quiz-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Enviar Simulado
      </button>
      <button class="btn btn-secondary" id="back-to-unit-btn">Voltar</button>
    </div>`;

  content.innerHTML = html;

  // Restaura os valores das textareas (necessário após innerHTML)
  questions
    .filter((q) => q.type === "discursive")
    .forEach((q) => {
      const ta = $(`#disc_${q.id}`);
      if (ta) ta.value = decodeURIComponent(ta.dataset.saved || "");
    });

  // Salva rascunho MC em tempo real
  const form = $("#quiz-form");
  form.addEventListener("change", (e) => {
    if (e.target.type === "radio") {
      unit.draftAnswers[e.target.name] = e.target.value;
      saveState();
      // Atualiza estilo de seleção
      const name = e.target.name;
      $$(`input[name="${name}"]`).forEach((inp) => {
        const lbl = inp.closest(".option-item");
        if (lbl) lbl.classList.toggle("selected", inp.checked);
      });
    }
    updateQuizProgress(questions);
  });

  // Salva rascunho discursivas em tempo real (debounce leve)
  let discSaveTimer = null;
  questions
    .filter((q) => q.type === "discursive")
    .forEach((q) => {
      const ta = $(`#disc_${q.id}`);
      if (!ta) return;
      ta.addEventListener("input", () => {
        unit.draftAnswers[`disc_${q.id}`] = ta.value;
        clearTimeout(discSaveTimer);
        discSaveTimer = setTimeout(() => saveState(), 500);
      });
    });

  // Progresso inicial (para questões já respondidas)
  updateQuizProgress(questions);

  $("#submit-quiz-btn").onclick = () =>
    handleQuizSubmit(unit, course, questions);
  $("#back-to-unit-btn").onclick = () => renderUnitView();
}

function updateQuizProgress(questions) {
  const mcQuestions = questions.filter((q) => q.type === "multiple_choice");
  const discQuestions = questions.filter((q) => q.type === "discursive");
  let answered = 0;
  mcQuestions.forEach((q) => {
    if ($(`input[name="mc_${q.id}"]:checked`)) answered++;
  });
  discQuestions.forEach((q) => {
    const el = $(`#disc_${q.id}`);
    if (el && el.value.trim().length > 10) answered++;
  });
  const total = questions.length;
  const pct = Math.round((answered / total) * 100);
  const fill = $("#quiz-progress-fill");
  if (fill) fill.style.width = pct + "%";
  const label = $("#quiz-progress-label");
  if (label) label.textContent = `${answered} / ${total}`;
}

// ─── QUIZ SUBMIT ─────────────────────────────────────────────────────────────
async function handleQuizSubmit(unit, course, questions) {
  const mcQuestions = questions.filter((q) => q.type === "multiple_choice");
  const discQuestions = questions.filter((q) => q.type === "discursive");

  let unanswered = [];
  mcQuestions.forEach((q) => {
    const fromDom = $(`input[name="mc_${q.id}"]:checked`);
    const fromDraft = unit.draftAnswers && unit.draftAnswers[`mc_${q.id}`];
    if (!fromDom && !fromDraft) unanswered.push(q.id);
  });
  discQuestions.forEach((q) => {
    const el = $(`#disc_${q.id}`);
    const fromDom = el ? el.value.trim() : "";
    const fromDraft =
      (unit.draftAnswers && unit.draftAnswers[`disc_${q.id}`]) || "";
    if (fromDom.length < 5 && fromDraft.length < 5) unanswered.push(q.id);
  });

  if (unanswered.length > 0) {
    const confirmed = await showConfirmationModal(
      "Questões sem resposta",
      `As questões ${unanswered.join(", ")} estão sem resposta. Deseja enviar assim mesmo?`,
      { confirmText: "Enviar mesmo assim", isDestructive: false },
    );
    if (!confirmed) return;
  }

  // Coleta MC — prioriza DOM, cai no rascunho
  const mcResults = [];
  let mcCorrect = 0;
  mcQuestions.forEach((q) => {
    const selected = $(`input[name="mc_${q.id}"]:checked`);
    const answer = selected
      ? selected.value
      : (unit.draftAnswers && unit.draftAnswers[`mc_${q.id}`]) || null;
    const correct = answer === q.correctAnswer;
    if (correct) mcCorrect++;
    mcResults.push({
      questionId: q.id,
      answer,
      correct,
      correctAnswer: q.correctAnswer,
    });
  });

  // Coleta discursivas — prioriza DOM, cai no rascunho
  const discAnswers = [];
  discQuestions.forEach((q) => {
    const el = $(`#disc_${q.id}`);
    const studentAnswer = el
      ? el.value.trim()
      : (unit.draftAnswers && unit.draftAnswers[`disc_${q.id}`]) || "";
    discAnswers.push({
      questionId: q.id,
      question: q.question,
      studentAnswer,
      expectedKeyPoints: q.expectedKeyPoints || [],
      keyPointWeights: q.keyPointWeights || [],
      sampleAnswer: q.sampleAnswer || "",
    });
  });

  showLoadingModal(
    "Avaliando Respostas Discursivas...",
    "A IA está analisando suas respostas discursivas...",
  );

  const discPayload = {
    learningContext: unit.content,
    discursiveAnswers: discAnswers,
  };
  const langPrefs = getLangPrefs();
  let discResult = null;

  await processRequest("AVALIADOR_DISCURSIVO", {
    history: [{ role: "user", parts: [{ text: JSON.stringify(discPayload) }] }],
    langPrefs,
    onSuccess: (data) => {
      discResult = data;
    },
  });

  // Cálculo de notas: MC = 6 pts, Discursivas = 4 pts, média mínima = 7
  const MC_WEIGHT = 6;
  const DISC_WEIGHT = 4;
  const PASS_THRESHOLD = 7;

  const mcPoints =
    mcQuestions.length > 0 ? (mcCorrect / mcQuestions.length) * MC_WEIGHT : 0;
  const maxDiscRaw = discResult
    ? discResult.maxDiscursiveScore
    : discQuestions.length * 10;
  const rawDiscScore = discResult ? discResult.totalDiscursiveScore : 0;
  const discPoints =
    maxDiscRaw > 0 ? (rawDiscScore / maxDiscRaw) * DISC_WEIGHT : 0;
  const totalScore = parseFloat((mcPoints + discPoints).toFixed(2));
  const passed = totalScore >= PASS_THRESHOLD;

  unit.result = {
    mcResults,
    mcCorrect,
    mcTotal: mcQuestions.length,
    discAnswers,
    discEvaluations: discResult ? discResult.evaluations : [],
    discOverallFeedback: discResult ? discResult.overallDiscursiveFeedback : "",
    totalScore,
    mcPoints: parseFloat(mcPoints.toFixed(2)),
    discPoints: parseFloat(discPoints.toFixed(2)),
    passed,
    passThreshold: PASS_THRESHOLD,
  };
  unit.completed = true;

  // Limpa rascunho após concluir
  unit.draftAnswers = {};

  const allDone = course.units.every((u) => u.completed);
  if (allDone) course.completed = true;
  saveState();
  renderSimuladoScreen();
}

// ─── RESULT VIEW ─────────────────────────────────────────────────────────────
function renderResultView(unit, course) {
  const r = unit.result;
  const content = $("#sim-content");
  const passed = r.passed;
  const threshold = r.passThreshold || 7;

  // Compatibilidade com resultados antigos (formato 0-100)
  let displayTotal, displayMC, displayDisc;
  if (r.totalScore > 10) {
    displayTotal = (r.totalScore / 10).toFixed(1);
    displayMC = (
      r.mcPoints !== undefined ? r.mcPoints : (r.mcScore / 100) * 6
    ).toFixed(2);
    displayDisc = (
      r.discPoints !== undefined ? r.discPoints : (r.discScore / 100) * 4
    ).toFixed(2);
  } else {
    displayTotal = r.totalScore !== undefined ? r.totalScore.toFixed(1) : "—";
    displayMC = r.mcPoints !== undefined ? r.mcPoints.toFixed(2) : "—";
    displayDisc = r.discPoints !== undefined ? r.discPoints.toFixed(2) : "—";
  }

  let html = `
    <div class="sim-header">
      <div class="sim-breadcrumb">${course.name} <span>›</span> ${unit.title}</div>
      <h1 class="sim-title">Resultado: ${unit.title}</h1>
    </div>
    <div class="result-hero">
      <div class="result-score ${passed ? "passed" : "failed"}">${displayTotal}</div>
      <div class="result-label">${passed ? "🎉 Aprovado!" : "📚 Continue estudando"}</div>
      <div class="result-sub">Média para aprovação: ${threshold} pontos &nbsp;|&nbsp; Escala: 0–10</div>
      <div class="result-stats">
        <div class="result-stat"><div class="result-stat-val" style="color:var(--accent)">${r.mcCorrect}/${r.mcTotal}</div><div class="result-stat-lbl">Acertos MC</div></div>
        <div class="result-stat"><div class="result-stat-val" style="color:var(--accent)">${displayMC} pts</div><div class="result-stat-lbl">Pontos MC (max 6)</div></div>
        <div class="result-stat"><div class="result-stat-val" style="color:var(--accent2)">${displayDisc} pts</div><div class="result-stat-lbl">Pontos Disc. (max 4)</div></div>
        <div class="result-stat"><div class="result-stat-val" style="color:${passed ? "var(--accent3)" : "var(--danger)"}">${displayTotal}</div><div class="result-stat-lbl">Nota Final (0–10)</div></div>
      </div>
    </div>`;

  // MC Review
  html += `<div class="unit-detail-card"><h3>Revisão — Múltipla Escolha</h3>`;
  const mcQuestions = unit.simulado.filter((q) => q.type === "multiple_choice");
  mcQuestions.forEach((q) => {
    const res = r.mcResults.find((x) => x.questionId === q.id);
    const correct = res && res.correct;
    html += `
      <div class="question-card multipla" style="margin-top:1rem;">
        <div class="question-number">
          <span>Questão ${q.id}</span>
          <span class="q-type-badge q-type-mc">Múltipla Escolha</span>
          ${correct ? `<span class="sim-badge green" style="margin-left:auto;">✓ Correta</span>` : `<span class="sim-badge" style="background:rgba(248,113,113,.12);color:var(--danger);margin-left:auto;">✗ Incorreta</span>`}
        </div>
        <div class="question-text">${q.question}</div>
        <div class="options-list">`;
    q.options.forEach((opt) => {
      const isCorrect = opt.id === q.correctAnswer;
      const isSelected = res && res.answer === opt.id;
      let cls = "option-item";
      if (isCorrect) cls += " correct";
      else if (isSelected) cls += " incorrect";
      html += `<div class="${cls}"><span class="option-letter">${opt.id}</span><span class="option-text">${opt.text}</span></div>`;
    });
    html += `</div>`;
    if (!correct && q.explanation) {
      html += `<div style="margin-top:0.8rem;padding:0.8rem;background:var(--surface2);border-radius:var(--radius);font-size:0.85rem;color:var(--text-muted);border-left:3px solid var(--accent);"><strong style="color:var(--text);">Explicação:</strong> ${q.explanation}</div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;

  // Discursive Review
  const discQuestions = unit.simulado.filter((q) => q.type === "discursive");
  if (discQuestions.length > 0) {
    html += `<div class="unit-detail-card"><h3>Revisão — Discursivas</h3>`;
    if (r.discOverallFeedback) {
      html += `<div style="padding:0.8rem 1rem;background:var(--surface2);border-radius:var(--radius);margin-bottom:1rem;font-size:0.88rem;color:var(--text-muted);">${r.discOverallFeedback}</div>`;
    }
    discQuestions.forEach((q) => {
      const ev = r.discEvaluations
        ? r.discEvaluations.find((e) => e.questionId === q.id)
        : null;
      const ans = r.discAnswers
        ? r.discAnswers.find((a) => a.questionId === q.id)
        : null;
      const statusClass = ev
        ? ev.status === "approved"
          ? "approved"
          : ev.status === "partial"
            ? "partial"
            : "reproved"
        : "partial";
      const statusLabel = ev
        ? ev.status === "approved"
          ? "Aprovado"
          : ev.status === "partial"
            ? "Parcial"
            : "Insuficiente"
        : "Aguardando";
      const statusColor =
        statusClass === "approved"
          ? "rgba(52,211,153,.12)"
          : statusClass === "partial"
            ? "rgba(251,191,36,.12)"
            : "rgba(248,113,113,.12)";
      const statusTextColor =
        statusClass === "approved"
          ? "var(--accent3)"
          : statusClass === "partial"
            ? "var(--warning)"
            : "var(--danger)";

      let keyPointsHtml = "";
      if (q.expectedKeyPoints && q.expectedKeyPoints.length > 0) {
        const weights = q.keyPointWeights || [];
        keyPointsHtml = `<div style="margin-top:0.6rem;padding:0.7rem 0.9rem;background:var(--surface3);border-radius:var(--radius);font-size:0.82rem;">
          <strong style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;">Pontos-chave avaliados:</strong>
          <ul style="margin:0.4rem 0 0 1rem;color:var(--text-muted);">
            ${q.expectedKeyPoints
              .map((kp, i) => {
                const w = weights[i]
                  ? `<span style="color:var(--accent);font-weight:700;">(peso: ${Math.round(weights[i] * 100)}%)</span>`
                  : "";
                return `<li>${kp} ${w}</li>`;
              })
              .join("")}
          </ul>
        </div>`;
      }

      html += `
        <div class="question-card discursive" style="margin-top:1rem;">
          <div class="question-number">
            <span>Questão ${q.id}</span>
            <span class="q-type-badge q-type-disc">Discursiva</span>
            ${ev ? `<span class="sim-badge" style="margin-left:auto;background:${statusColor};color:${statusTextColor};">${statusLabel} (${ev.score}/${ev.maxScore})</span>` : ""}
          </div>
          <div class="question-text">${q.question}</div>
          ${keyPointsHtml}
          ${ans ? `<div style="padding:0.9rem 1rem;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;margin-top:0.6rem;"><strong style="font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Sua Resposta:</strong><br/><span style="color:var(--text);">${ans.studentAnswer || "<em>Não respondida</em>"}</span></div>` : ""}
          ${ev ? `<div class="discursive-result ${statusClass}"><span class="dr-label">${statusLabel}</span>${ev.feedback}</div>` : ""}
          ${ev && ev.missingPoints && ev.missingPoints.length > 0 ? `<div style="margin-top:0.5rem;padding:0.6rem 0.9rem;background:rgba(248,113,113,0.07);border-radius:var(--radius);border-left:3px solid var(--danger);font-size:0.83rem;"><strong style="color:var(--danger);">Pontos que faltaram:</strong><ul style="margin:0.3rem 0 0 1rem;color:var(--text-muted);">${ev.missingPoints.map((p) => `<li>${p}</li>`).join("")}</ul></div>` : ""}
        </div>`;
    });
    html += `</div>`;
  }

  html += `<div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1rem;">`;
  const nextIdx = course.units.findIndex(
    (u, i) => i > appState.activeUnitIndex && !u.completed,
  );
  if (nextIdx >= 0)
    html += `<button class="btn btn-primary" id="next-unit-btn">Próxima Unidade →</button>`;
  if (course.completed && passed)
    html += `<button class="btn btn-success" id="show-cert-btn">🎓 Ver Certificado</button>`;
  html += `</div>`;

  content.innerHTML = html;
  const nextBtn = $("#next-unit-btn");
  if (nextBtn) nextBtn.onclick = () => selectUnit(nextIdx);
  const certBtn = $("#show-cert-btn");
  if (certBtn) certBtn.onclick = () => showCertificatePreview();
}

// ─── CERTIFICATE ─────────────────────────────────────────────────────────────
async function showCertificatePreview() {
  const course = getActiveCourse();
  const certInfo = JSON.parse(localStorage.getItem(CERTIFICATE_KEY) || "null");
  const name = certInfo ? certInfo.name : "Nome do Aluno";
  const date = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $("#nome-aluno-render").textContent = name;
  $("#nome-curso-render").textContent =
    `"${course ? course.name : "Disciplina EAD"}"`;
  $("#data-emissao-render").textContent = `Emitido em ${date}`;
  $("#certificate-preview-modal").classList.remove("hidden");
  await handleGenerateCertificate();
}

async function handleGenerateCertificate() {
  const btn = $("#download-certificate-btn");
  if (btn) {
    btn.textContent = "Gerando...";
    btn.disabled = true;
  }
  const orig = $("#certificado-container-render");
  const clone = orig.cloneNode(true);
  Object.assign(clone.style, {
    width: "820px",
    height: "540px",
    transform: "scale(1)",
    position: "absolute",
    left: "-9999px",
    top: "-9999px",
  });
  document.body.appendChild(clone);
  const certInfo = JSON.parse(localStorage.getItem(CERTIFICATE_KEY) || "{}");
  const namePart = (certInfo.name || "aluno").trim().replace(/\s+/g, "_");
  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      width: 820,
      height: 540,
    });
    const url = canvas.toDataURL("image/png");
    generatedCertificateUrl = url;
    generatedCertificateName = namePart;
    const preview = $("#div-preview-certificado");
    if (preview) {
      preview.innerHTML = "";
      const img = document.createElement("img");
      img.src = url;
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";
      preview.appendChild(img);
    }
  } catch (e) {
    console.error(e);
  } finally {
    document.body.removeChild(clone);
    if (btn) {
      btn.textContent = "Baixar Certificado";
      btn.disabled = false;
    }
  }
}

function downloadCertificate() {
  if (!generatedCertificateUrl) return;
  const link = document.createElement("a");
  link.href = generatedCertificateUrl;
  link.download = `Certificado_${generatedCertificateName}.png`;
  link.click();
}

// ─── PROCESS REQUEST (API / MANUAL) ─────────────────────────────────────────
async function processRequest(requestType, context) {
  const useApi = localStorage.getItem(API_MODE_KEY) === "true";

  if (useApi) {
    hideLoadingModal();
    showSupportModal();
    return;
  }

  const langPrefs = context.langPrefs || getLangPrefs();
  const sysPrompt = getPrompt(requestType, langPrefs);
  const requestBody = {
    contents: context.history,
    systemInstruction: { parts: [{ text: sysPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      response_mime_type: "application/json",
    },
  };

  hideLoadingModal();

  return new Promise((resolve) => {
    // Registra o callback ÚNICO que faz tudo: executa onSuccess E resolve a Promise
    onManualResponseSubmit = (data) => {
      context.onSuccess(data);
      _pendingPromptContext = null;
      onManualResponseSubmit = null;
      resolve();
    };

    _pendingPromptContext = { requestType, context, requestBody, resolve };

    // Abre o modal SEM passar callback — o onManualResponseSubmit já está setado
    _showPromptModalRaw(PROMPT_TITLES[requestType], requestBody);
  });
}

function _showPromptModalRaw(title, requestBody) {
  $("#prompt-modal-title").textContent = title;
  $("#prompt-display").textContent = JSON.stringify(requestBody, null, 2);
  $("#response-input").value = "";
  $("#modal-error-message").classList.add("hidden");
  $("#prompt-modal").classList.remove("hidden");
}

// Mantém o nome antigo como alias para compatibilidade com chamadas externas
function showPromptModal(title, requestBody, callback) {
  if (callback) {
    onManualResponseSubmit = (data) => {
      callback(data);
      _pendingPromptContext = null;
      onManualResponseSubmit = null;
    };
  }
  _showPromptModalRaw(title, requestBody);
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function showLoadingModal(title, subtitle) {
  const el = $("#loading-modal");
  if (!el) return;
  const t = $("#loading-title");
  if (t) t.textContent = title || "Processando...";
  const s = $("#loading-subtitle");
  if (s) s.textContent = subtitle || "Aguarde, a IA está trabalhando...";
  el.classList.remove("hidden");
}
function hideLoadingModal() {
  const el = $("#loading-modal");
  if (el) el.classList.add("hidden");
}

function showConfirmationModal(title, message, options = {}) {
  return new Promise((resolve) => {
    const modal = $("#confirmation-modal");
    $("#confirmation-title").textContent = title;
    $("#confirmation-message").innerHTML = message;
    const actions = $("#confirmation-actions");
    actions.innerHTML = "";
    const close = (r) => {
      modal.classList.add("hidden");
      resolve(r);
    };
    if (options.showCancel !== false) {
      const cancel = document.createElement("button");
      cancel.className = "btn btn-secondary confirm-cancel";
      cancel.textContent = options.cancelText || "Cancelar";
      cancel.onclick = () => close(false);
      actions.appendChild(cancel);
    }
    const confirm = document.createElement("button");
    confirm.className = `btn ${options.isDestructive ? "btn-danger confirm-destructive" : "btn-primary"}`;
    confirm.textContent = options.confirmText || "Confirmar";
    confirm.onclick = () => close(true);
    actions.appendChild(confirm);
    $("#confirm-close-btn").onclick = () => close(false);
    modal.classList.remove("hidden");
  });
}

function showPromptModal(title, requestBody, callback) {
  onManualResponseSubmit = (data) => {
    if (callback) callback(data);
    _pendingPromptContext = null;
  };
  $("#prompt-modal-title").textContent = title;
  $("#prompt-display").textContent = JSON.stringify(requestBody, null, 2);
  $("#response-input").value = "";
  $("#modal-error-message").classList.add("hidden");
  $("#prompt-modal").classList.remove("hidden");
}

function hidePromptModal() {
  $("#prompt-modal").classList.add("hidden");
  // Não limpa callbacks — permite reabrir o prompt ao clicar na unidade novamente
}

function showSupportModal() {
  $("#support-modal").classList.remove("hidden");
}

// ─── TUTORIAL ─────────────────────────────────────────────────────────────────
function showTutorial() {
  $("#tutorial-modal").classList.remove("hidden");
  renderTutorialStep(0);
}
function renderTutorialStep(idx) {
  const step = tutorialSteps[idx];
  $("#tutorial-title").textContent = step.title;
  $("#tutorial-step-content").innerHTML = step.content;
  $("#tutorial-prev-btn").classList.toggle("hidden", idx === 0);
  $("#tutorial-next-btn").classList.toggle(
    "hidden",
    idx === tutorialSteps.length - 1,
  );
  $("#tutorial-finish-btn").classList.toggle(
    "hidden",
    idx !== tutorialSteps.length - 1,
  );
  const prog = $("#tutorial-progress");
  prog.innerHTML = "";
  tutorialSteps.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = "progress-dot";
    if (i === idx) dot.classList.add("active");
    prog.appendChild(dot);
  });
  currentTutorialStep = idx;
}
function closeTutorial() {
  $("#tutorial-modal").classList.add("hidden");
  localStorage.setItem(TUTORIAL_KEY, "true");
  checkCertificateInfo();
}
function checkCertificateInfo() {
  if (!localStorage.getItem(CERTIFICATE_KEY))
    $("#certificate-modal").classList.remove("hidden");
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
function setupEventListeners() {
  // Settings open/close
  $("#settings-btn").onclick = () =>
    $("#settings-modal").classList.remove("hidden");
  $("#settings-close-btn").onclick = () =>
    $("#settings-modal").classList.add("hidden");
  $("#settings-overlay").onclick = () =>
    $("#settings-modal").classList.add("hidden");

  // Theme
  $("#theme-switch").addEventListener("change", (e) => {
    const t = e.target.checked ? "dark" : "light";
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  });

  // API mode sync
  const syncApi = (src) => {
    const v = src.checked;
    localStorage.setItem(API_MODE_KEY, v);
    $("#api-mode-toggle").checked = v;
    $("#api-mode-switch-settings").checked = v;
    updateModeLabels();
  };
  $("#api-mode-toggle").addEventListener("change", (e) => syncApi(e.target));
  $("#api-mode-switch-settings").addEventListener("change", (e) =>
    syncApi(e.target),
  );
  // Language prefs sync
  const syncLang = () => {
    const tq = $("#lang-questions-switch");
    const ta = $("#lang-answers-switch");
    saveLangPrefs({
      questionsInContentLang: tq ? tq.checked : true,
      answersInContentLang: ta ? ta.checked : true,
    });
  };
  const lq = $("#lang-questions-switch");
  if (lq) lq.addEventListener("change", syncLang);
  const la = $("#lang-answers-switch");
  if (la) la.addEventListener("change", syncLang);

  // Zoom
  $("#zoom-in-btn").onclick = () => {
    currentZoomLevel = Math.min(1.5, +(currentZoomLevel + 0.1).toFixed(1));
    applyZoom();
  };
  $("#zoom-out-btn").onclick = () => {
    currentZoomLevel = Math.max(0.5, +(currentZoomLevel - 0.1).toFixed(1));
    applyZoom();
  };

  // Change name
  $("#change-name-btn").onclick = () => {
    const info = JSON.parse(localStorage.getItem(CERTIFICATE_KEY) || "null");
    $("#student-name").value = info ? info.name : "";
    $("#settings-modal").classList.add("hidden");
    $("#certificate-modal").classList.remove("hidden");
  };

  // Certificate form
  $("#certificate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#student-name").value.trim();
    if (name) {
      localStorage.setItem(CERTIFICATE_KEY, JSON.stringify({ name }));
      $("#certificate-modal").classList.add("hidden");
    }
  });
  $("#certificate-close-btn").onclick = () =>
    $("#certificate-modal").classList.add("hidden");

  // Certificate preview
  $("#cert-preview-close-btn").onclick = () =>
    $("#certificate-preview-modal").classList.add("hidden");
  $("#download-certificate-btn").onclick = downloadCertificate;

  // Clear all
  $("#clear-storage-btn").onclick = async () => {
    const ok = await showConfirmationModal(
      "Apagar Tudo",
      "Tem certeza? Todos os dados serão apagados.",
      { confirmText: "Apagar Tudo", isDestructive: true },
    );
    if (ok) {
      localStorage.clear();
      location.reload();
    }
  };

  // Register modal
  $("#open-register-btn").onclick = () => {
    if (localStorage.getItem(API_MODE_KEY) === "true") {
      showSupportModal();
      return;
    }
    openRegisterModal();
  };
  $("#register-close-btn").onclick = () => {
    isSubmitting = false;
    $("#register-modal").classList.add("hidden");
  };
  $("#register-cancel-btn").onclick = () => {
    isSubmitting = false;
    $("#register-modal").classList.add("hidden");
  };
  $("#reg-units-count").addEventListener("change", (e) =>
    buildUnitFields(parseInt(e.target.value)),
  );
  $("#register-submit-btn").onclick = handleRegisterSubmit;

  // Dashboard click (open course / delete)
  $("#courses-container").addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".delete-course-btn");
    if (delBtn) {
      e.stopPropagation();
      const cid = delBtn.dataset.courseId;
      const course = appState.courses[cid];
      const ok = await showConfirmationModal(
        "Apagar Disciplina",
        `Apagar "${course?.name}"?`,
        { confirmText: "Apagar", isDestructive: true },
      );
      if (ok) {
        delete appState.courses[cid];
        saveState();
        renderDashboard();
      }
      return;
    }
    const openBtn = e.target.closest("[data-action='open']");
    if (openBtn) {
      selectCourse(openBtn.dataset.courseId);
      return;
    }
    const card = e.target.closest(".course-card");
    if (card) selectCourse(card.dataset.courseId);
  });

  // Back to dashboard
  $("#back-to-dashboard").onclick = () => renderDashboard();

  // Prompt modal
  $("#prompt-close-btn").onclick = hidePromptModal;
  $("#prompt-cancel-btn").onclick = hidePromptModal;
  $("#copy-prompt-btn").onclick = () => {
    navigator.clipboard.writeText($("#prompt-display").textContent);
    $("#copy-prompt-btn").textContent = "Copiado!";
    setTimeout(
      () => ($("#copy-prompt-btn").textContent = "Copiar Prompt"),
      2000,
    );
  };
  $("#submit-response-btn").onclick = () => {
    const raw = $("#response-input").value.trim();
    const errEl = $("#modal-error-message");
    if (!raw) {
      errEl.textContent = "Resposta vazia.";
      errEl.classList.remove("hidden");
      return;
    }
    let txt = raw.startsWith("```json")
      ? raw.slice(7, -3)
      : raw.startsWith("```")
        ? raw.slice(3, -3)
        : raw;
    try {
      const json = JSON.parse(txt.trim());
      if (onManualResponseSubmit) onManualResponseSubmit(json);
      hidePromptModal();
    } catch (err) {
      errEl.textContent = `JSON inválido: ${err.message}`;
      errEl.classList.remove("hidden");
    }
  };

  // Support modal
  $("#support-close-btn").onclick = () =>
    $("#support-modal").classList.add("hidden");

  // Tutorial
  $("#tutorial-next-btn").onclick = () =>
    renderTutorialStep(
      Math.min(currentTutorialStep + 1, tutorialSteps.length - 1),
    );
  $("#tutorial-prev-btn").onclick = () =>
    renderTutorialStep(Math.max(currentTutorialStep - 1, 0));
  $("#tutorial-finish-btn").onclick = closeTutorial;

  // Mobile sidebar
  $("#mobile-sidebar-toggle").onclick = () => {
    $("#sim-sidebar").classList.add("open");
    $("#sidebar-overlay").classList.add("active");
  };
  $("#close-sidebar").onclick = () => {
    $("#sim-sidebar").classList.remove("open");
    $("#sidebar-overlay").classList.remove("active");
  };
  $("#sidebar-overlay").onclick = () => {
    $("#sim-sidebar").classList.remove("open");
    $("#sidebar-overlay").classList.remove("active");
  };
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initSettings();
  setupEventListeners();
  renderDashboard();
  if (!localStorage.getItem(TUTORIAL_KEY)) {
    setTimeout(showTutorial, 600);
  } else {
    checkCertificateInfo();
  }
});
