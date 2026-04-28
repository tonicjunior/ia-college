// ─── GLOBALS & CONSTANTS ────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const STORAGE_KEY = "iaEad_v1_state";
const CERTIFICATE_KEY = "iaAcademy_v9_certificate_info";
const TUTORIAL_KEY = "iaEad_v1_tutorial_shown";
const THEME_KEY = "iaAcademy_theme_setting";
const ZOOM_KEY = "iaAcademy_zoom_level";
const API_MODE_KEY = "iaAcademy_api_mode";
const ASSISTANT_KEY = "iaAcademy_assistant_enabled";
const API_BACK_END = "https://academy01.app.n8n.cloud/webhook/academy";
const SHOW_SUPPORT = true;

let appState = {};
let currentZoomLevel = 1;
let onManualResponseSubmit = null;
let isSubmitting = false;
let generatedCertificateUrl = null;
let generatedCertificateName = null;

// ─── PROMPTS ─────────────────────────────────────────────────────────────────
const PROMPTS = {
  // Gera 20 questões de simulado (15 MC + 5 discursivas) com base no conteúdo da unidade
  SIMULADO: `Você é um avaliador acadêmico experiente especializado em provas de EAD universitário.
Sua missão é criar um simulado completo, desafiador e bem elaborado com base EXCLUSIVAMENTE no conteúdo fornecido pelo aluno.

A resposta DEVE ser um objeto JSON puro. Nenhum texto externo, nenhum bloco markdown.

ESTRUTURA OBRIGATÓRIA:
{
  "unitTitle": "Título sugerido para a unidade com base no conteúdo",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Texto da pergunta",
      "options": [
        {"id": "A", "text": "..."},
        {"id": "B", "text": "..."},
        {"id": "C", "text": "..."},
        {"id": "D", "text": "..."}
      ],
      "correctAnswer": "B",
      "cognitiveLevel": "recall|comprehension|application|analysis",
      "explanation": "Por que esta é a resposta correta, explicado brevemente."
    },
    {
      "id": 16,
      "type": "discursive",
      "question": "Texto da pergunta discursiva",
      "expectedKeyPoints": ["ponto 1 esperado", "ponto 2 esperado", "ponto 3 esperado"],
      "sampleAnswer": "Resposta modelo completa e bem elaborada para referência da IA avaliadora."
    }
  ]
}

DISTRIBUIÇÃO OBRIGATÓRIA DAS 20 QUESTÕES:
- Questões 1-15: MÚLTIPLA ESCOLHA (type: "multiple_choice")
- Questões 16-20: DISCURSIVAS (type: "discursive")

DISTRIBUIÇÃO COGNITIVA DAS 15 MÚLTIPLA ESCOLHA:
- 2 de RECALL: identificação direta de conceito ou definição
- 4 de COMPREENSÃO: o aluno explica, distingue ou reformula
- 5 de APLICAÇÃO: cenário novo que exige aplicar o conhecimento estudado
- 4 de ANÁLISE: identificar causas, comparar abordagens, avaliar decisões

REGRAS DE QUALIDADE:
1. BASE: use APENAS informações presentes no conteúdo fornecido. Não invente dados.
2. DISTRATORES: cada distrator incorreto deve representar um erro de raciocínio real (não absurdos). Os distratores devem ser plausíveis para quem não estudou bem.
3. DISCURSIVAS: cada questão discursiva deve exigir resposta estruturada com pelo menos 3 pontos relevantes. Liste em expectedKeyPoints os pontos mínimos esperados.
4. NÍVEL: o simulado deve ser equivalente a uma prova de faculdade EAD. Não infantilize.
5. VARIEDADE: varie o formato — comparações, casos hipotéticos, análise de situações, erro de raciocínio para identificar.

INPUT QUE VOCÊ RECEBERÁ:
{ "courseName": "...", "unitNumber": N, "unitContent": "conteúdo completo colado pelo aluno" }`,

  // Avalia respostas discursivas do aluno comparando com a resposta modelo
  AVALIADOR_DISCURSIVO: `Você é um professor avaliador universitário. Sua missão é avaliar as respostas discursivas de um aluno com rigor e justiça, baseando-se exclusivamente no conteúdo de referência fornecido.

A resposta DEVE ser um objeto JSON puro. Nenhum texto externo.

ESTRUTURA:
{
  "evaluations": [
    {
      "questionId": 16,
      "score": 7,
      "maxScore": 10,
      "status": "approved|partial|reproved",
      "feedback": "Feedback detalhado sobre o que o aluno acertou e o que faltou na resposta.",
      "missingPoints": ["ponto que faltou 1", "ponto que faltou 2"]
    }
  ],
  "totalDiscursiveScore": 35,
  "maxDiscursiveScore": 50,
  "overallDiscursiveFeedback": "Comentário geral sobre o desempenho nas discursivas."
}

REGRAS DE AVALIAÇÃO:
1. Cada questão discursiva vale 10 pontos. Total discursivo: 50 pontos.
2. status "approved" = 7-10 pontos (aluno cobriu os pontos principais).
3. status "partial" = 4-6 pontos (aluno cobriu parcialmente, faltam pontos relevantes).
4. status "reproved" = 0-3 pontos (resposta superficial, errada ou fora do tema).
5. Compare a resposta do aluno com expectedKeyPoints e sampleAnswer para avaliar.
6. O feedback deve ser construtivo: aponte o que o aluno acertou ANTES de apontar o que faltou.
7. Não penalize por ortografia ou gramática, apenas pelo conteúdo conceitual.

INPUT QUE VOCÊ RECEBERÁ:
{
  "learningContext": "conteúdo original da unidade",
  "discursiveAnswers": [
    {
      "questionId": 16,
      "question": "texto da questão",
      "studentAnswer": "resposta do aluno",
      "expectedKeyPoints": [...],
      "sampleAnswer": "resposta modelo"
    }
  ]
}`,
};

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
    if (ts) ts.checked = true;
  } else {
    document.documentElement.classList.remove("light");
    const ts = $("#theme-switch");
    if (ts) ts.checked = false;
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
  const assistEnabled = localStorage.getItem(ASSISTANT_KEY) === "true";
  const as = $("#assistant-switch");
  if (as) as.checked = assistEnabled;
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
    alert("Informe o nome da disciplina.");
    return;
  }
  const count = parseInt($("#reg-units-count").value);
  const units = [];
  for (let i = 1; i <= count; i++) {
    const content = ($(`#unit-content-${i}`)?.value || "").trim();
    if (!content) {
      alert(`Preencha o conteúdo da Unidade ${i}.`);
      return;
    }
    units.push({
      number: i,
      content,
      title: `Unidade ${i}`,
      simulado: null,
      completed: false,
      result: null,
    });
  }
  isSubmitting = true;
  $("#register-submit-btn").disabled = true;
  $("#register-modal").classList.add("hidden");

  // Generate simulado for each unit sequentially
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

  // Generate all simulados
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const payload = {
      courseName: name,
      unitNumber: unit.number,
      unitContent: unit.content,
    };
    await processRequest("SIMULADO", {
      history: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      onSuccess: (data) => {
        unit.title = data.unitTitle || `Unidade ${unit.number}`;
        unit.simulado = data.questions;
        saveState();
      },
    });
  }

  isSubmitting = false;
  $("#register-submit-btn").disabled = false;
  renderDashboard();
  setTimeout(() => selectCourse(courseId), 200);
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
    content.innerHTML = `
      <div class="sim-header">
        <div class="sim-breadcrumb">${course.name} <span>›</span> Unidade ${unit.number}</div>
        <h1 class="sim-title">${unit.title}</h1>
      </div>
      <div class="loading-card">
        <div class="spinner"></div>
        <p>Gerando o simulado desta unidade...</p>
      </div>`;
    return;
  }

  // Unit ready — show start screen
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

  questions.forEach((q, i) => {
    const isDisc = q.type === "discursive";
    html += `
      <div class="question-card ${isDisc ? "discursive" : "multipla"}" id="qcard-${q.id}">
        <div class="question-number">
          <span>Questão ${q.id}</span>
          <span class="q-type-badge ${isDisc ? "q-type-disc" : "q-type-mc"}">${isDisc ? "Discursiva" : "Múltipla Escolha"}</span>
        </div>
        <div class="question-text">${q.question}</div>`;

    if (isDisc) {
      html += `<textarea class="discursive-answer" name="disc_${q.id}" id="disc_${q.id}" placeholder="Escreva sua resposta aqui. Seja claro(a) e aborde os pontos principais do conteúdo..." rows="5"></textarea>`;
    } else {
      html += `<div class="options-list">`;
      q.options.forEach((opt) => {
        html += `
          <label class="option-item" id="opt-${q.id}-${opt.id}">
            <input type="radio" name="mc_${q.id}" value="${opt.id}" />
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

  // Track progress as user answers
  const form = $("#quiz-form");
  form.addEventListener("change", () => updateQuizProgress(questions));
  // Option click styling
  form.addEventListener("change", (e) => {
    if (e.target.type === "radio") {
      const name = e.target.name;
      $$(`input[name="${name}"]`).forEach((inp) => {
        const lbl = inp.closest(".option-item");
        if (lbl) lbl.classList.toggle("selected", inp.checked);
      });
    }
  });

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
  // Validate all answered
  const mcQuestions = questions.filter((q) => q.type === "multiple_choice");
  const discQuestions = questions.filter((q) => q.type === "discursive");
  let unanswered = [];
  mcQuestions.forEach((q) => {
    if (!$(`input[name="mc_${q.id}"]:checked`)) unanswered.push(q.id);
  });
  discQuestions.forEach((q) => {
    const el = $(`#disc_${q.id}`);
    if (!el || el.value.trim().length < 5) unanswered.push(q.id);
  });
  if (unanswered.length > 0) {
    const confirmed = await showConfirmationModal(
      "Questões sem resposta",
      `As questões ${unanswered.join(", ")} estão sem resposta. Deseja enviar assim mesmo?`,
      { confirmText: "Enviar mesmo assim", isDestructive: false },
    );
    if (!confirmed) return;
  }

  // Collect MC answers and score immediately
  const mcResults = [];
  let mcCorrect = 0;
  mcQuestions.forEach((q) => {
    const selected = $(`input[name="mc_${q.id}"]:checked`);
    const answer = selected ? selected.value : null;
    const correct = answer === q.correctAnswer;
    if (correct) mcCorrect++;
    mcResults.push({
      questionId: q.id,
      answer,
      correct,
      correctAnswer: q.correctAnswer,
    });
  });

  // Collect discursive answers
  const discAnswers = [];
  discQuestions.forEach((q) => {
    const el = $(`#disc_${q.id}`);
    discAnswers.push({
      questionId: q.id,
      question: q.question,
      studentAnswer: el ? el.value.trim() : "",
      expectedKeyPoints: q.expectedKeyPoints || [],
      sampleAnswer: q.sampleAnswer || "",
    });
  });

  // Show partial result while evaluating discursive
  showLoadingModal(
    "Avaliando Respostas Discursivas...",
    "A IA está analisando suas respostas discursivas...",
  );

  const discPayload = {
    learningContext: unit.content,
    discursiveAnswers: discAnswers,
  };
  let discResult = null;
  await processRequest("AVALIADOR_DISCURSIVO", {
    history: [{ role: "user", parts: [{ text: JSON.stringify(discPayload) }] }],
    onSuccess: (data) => {
      discResult = data;
    },
  });

  // Build final result
  const mcScore =
    mcQuestions.length > 0 ? (mcCorrect / mcQuestions.length) * 50 : 0; // MC = 50% of grade
  const discScore = discResult ? discResult.totalDiscursiveScore : 0;
  const maxDiscScore = discResult ? discResult.maxDiscursiveScore : 50;
  const discPct = maxDiscScore > 0 ? (discScore / maxDiscScore) * 50 : 0; // Discursive = 50% of grade
  const totalScore = Math.round(mcScore + discPct);

  unit.result = {
    mcResults,
    mcCorrect,
    mcTotal: mcQuestions.length,
    discAnswers,
    discEvaluations: discResult ? discResult.evaluations : [],
    discOverallFeedback: discResult ? discResult.overallDiscursiveFeedback : "",
    totalScore,
    mcScore: Math.round(mcScore * 2), // out of 100
    discScore: Math.round(discPct * 2), // out of 100
    passed: totalScore >= 60,
  };
  unit.completed = true;

  // Check if all units completed
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

  let html = `
    <div class="sim-header">
      <div class="sim-breadcrumb">${course.name} <span>›</span> ${unit.title}</div>
      <h1 class="sim-title">Resultado: ${unit.title}</h1>
    </div>
    <div class="result-hero">
      <div class="result-score ${passed ? "passed" : "failed"}">${r.totalScore}%</div>
      <div class="result-label">${passed ? "🎉 Aprovado!" : "📚 Continue estudando"}</div>
      <div class="result-sub">Nota mínima para aprovação: 60%</div>
      <div class="result-stats">
        <div class="result-stat"><div class="result-stat-val" style="color:var(--accent)">${r.mcCorrect}/${r.mcTotal}</div><div class="result-stat-lbl">Múltipla Escolha</div></div>
        <div class="result-stat"><div class="result-stat-val" style="color:var(--accent2)">${r.discScore}%</div><div class="result-stat-lbl">Discursivas</div></div>
        <div class="result-stat"><div class="result-stat-val" style="color:${passed ? "var(--accent3)" : "var(--danger)"}">${r.totalScore}%</div><div class="result-stat-lbl">Nota Final</div></div>
      </div>
    </div>`;

  // MC Review
  html += `<div class="unit-detail-card"><h3>Revisão — Múltipla Escolha</h3>`;
  const mcQuestions = unit.simulado.filter((q) => q.type === "multiple_choice");
  mcQuestions.forEach((q, i) => {
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
      html += `
        <div class="question-card discursive" style="margin-top:1rem;">
          <div class="question-number">
            <span>Questão ${q.id}</span>
            <span class="q-type-badge q-type-disc">Discursiva</span>
            ${ev ? `<span class="sim-badge ${statusClass === "approved" ? "green" : statusClass === "partial" ? "" : ""}" style="margin-left:auto;background:${statusClass === "approved" ? "rgba(52,211,153,.12)" : statusClass === "partial" ? "rgba(251,191,36,.12)" : "rgba(248,113,113,.12)"};color:${statusClass === "approved" ? "var(--accent3)" : statusClass === "partial" ? "var(--warning)" : "var(--danger)"};">${statusLabel} ${ev ? `(${ev.score}/${ev.maxScore})` : ""}</span>` : ""}
          </div>
          <div class="question-text">${q.question}</div>
          ${ans ? `<div style="padding:0.9rem 1rem;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;margin-top:0.6rem;"><strong style="font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Sua Resposta:</strong><br/><span style="color:var(--text);">${ans.studentAnswer || "<em>Não respondida</em>"}</span></div>` : ""}
          ${ev ? `<div class="discursive-result ${statusClass}"><span class="dr-label">${statusLabel}</span>${ev.feedback}</div>` : ""}
        </div>`;
    });
    html += `</div>`;
  }

  // Actions
  html += `<div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1rem;">`;
  // Next unit
  const nextIdx = course.units.findIndex(
    (u, i) => i > appState.activeUnitIndex && !u.completed,
  );
  if (nextIdx >= 0) {
    html += `<button class="btn btn-primary" id="next-unit-btn">Próxima Unidade →</button>`;
  }
  if (course.completed && passed) {
    html += `<button class="btn btn-success" id="show-cert-btn">🎓 Ver Certificado</button>`;
  }
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
  if (SHOW_SUPPORT && localStorage.getItem(API_MODE_KEY) === "true") {
    showSupportModal();
    return;
  }
  const useApi = localStorage.getItem(API_MODE_KEY) === "true";
  const sysPrompt = PROMPTS[requestType];
  const requestBody = {
    contents: context.history,
    systemInstruction: { parts: [{ text: sysPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      response_mime_type: "application/json",
    },
  };
  showLoadingModal(PROMPT_TITLES[requestType]);
  if (useApi) {
    try {
      const res = await fetch(API_BACK_END, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.[0]?.output) throw new Error("Resposta inesperada da API.");
      const parsed = JSON.parse(data[0].output);
      context.onSuccess(parsed);
    } catch (err) {
      console.error(err);
      await showConfirmationModal(
        "Erro na API",
        `Ocorreu um erro: ${err.message}`,
        { confirmText: "OK", showCancel: false },
      );
    } finally {
      hideLoadingModal();
    }
  } else {
    hideLoadingModal();
    showPromptModal(PROMPT_TITLES[requestType], requestBody, context.onSuccess);
  }
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
  onManualResponseSubmit = callback;
  $("#prompt-modal-title").textContent = title;
  $("#prompt-display").textContent = JSON.stringify(requestBody, null, 2);
  $("#response-input").value = "";
  $("#modal-error-message").classList.add("hidden");
  $("#prompt-modal").classList.remove("hidden");
  const assistEnabled = localStorage.getItem(ASSISTANT_KEY) === "true";
  if (window.innerWidth > 768 && assistEnabled)
    $("#chatbot-container").classList.remove("hidden");
}

function hidePromptModal() {
  $("#prompt-modal").classList.add("hidden");
  onManualResponseSubmit = null;
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
    const t = e.target.checked ? "light" : "dark";
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

  // Zoom
  $("#zoom-in-btn").onclick = () => {
    currentZoomLevel = Math.min(1.5, +(currentZoomLevel + 0.1).toFixed(1));
    applyZoom();
  };
  $("#zoom-out-btn").onclick = () => {
    currentZoomLevel = Math.max(0.5, +(currentZoomLevel - 0.1).toFixed(1));
    applyZoom();
  };

  // Assistant
  $("#assistant-switch").addEventListener("change", (e) =>
    localStorage.setItem(ASSISTANT_KEY, e.target.checked),
  );

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
  $("#open-register-btn").onclick = openRegisterModal;
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

  // Chatbot
  const chatToggle = $("#chatbot-toggle-btn");
  const chatContainer = $("#chatbot-container");
  const chatClose = $("#chatbot-close-btn");
  if (chatToggle)
    chatToggle.onclick = () => chatContainer.classList.toggle("hidden");
  if (chatClose)
    chatClose.onclick = () => {
      chatContainer.classList.add("hidden");
    };

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
