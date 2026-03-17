import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, onSnapshot, deleteDoc, doc, Timestamp, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZsg2GbxrgX70VZwPHiXkoFMCTt7i3_6U",
  authDomain: "indicador-de-presenca-modular.firebaseapp.com",
  projectId: "indicador-de-presenca-modular",
  storageBucket: "indicador-de-presenca-modular.firebasestorage.app",
  messagingSenderId: "895253390208",
  appId: "1:895253390208:web:943f8679a0dbf36a531765"
};

const appFire = initializeApp(firebaseConfig);
const db = getFirestore(appFire);
const auth = getAuth(appFire);

let chartEvolution = null;
let marcosGlobais = []; // Guarda a linha do tempo dos Efetivos Base

Chart.register(ChartDataLabels);

const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
    didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
});

// --- TRADUTOR DE CALENDÁRIO (A PONTE COM O APP 1) ---
function getWeekId(dateObj) {
    const diaDaSemana = dateObj.getDay();
    const diffParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const segundaFeira = new Date(dateObj);
    segundaFeira.setDate(dateObj.getDate() + diffParaSegunda);

    const sextaFeira = new Date(segundaFeira);
    sextaFeira.setDate(segundaFeira.getDate() + 4);

    const mesesSiglas = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

    const diaSeg = String(segundaFeira.getDate()).padStart(2, '0');
    const mesSeg = mesesSiglas[segundaFeira.getMonth()];
    const anoSeg = segundaFeira.getFullYear();

    const diaSex = String(sextaFeira.getDate()).padStart(2, '0');
    const mesSex = mesesSiglas[sextaFeira.getMonth()];

    if (mesSeg === mesSex) return `${diaSeg} a ${diaSex} ${mesSeg} de ${anoSeg}`;
    return `${diaSeg} ${mesSeg} a ${diaSex} ${mesSex} de ${anoSeg}`;
}

window.app = {
    login: async () => {
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value);
            Toast.fire({ icon: 'success', title: 'Login realizado!' });
        } catch (e) { Swal.fire({ icon: 'error', title: 'Erro', text: 'Verifique login e senha.' }); }
    },
    logout: () => {
        Swal.fire({ title: 'Sair?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#2563eb', cancelButtonColor: '#d33', confirmButtonText: 'Sair' }).then((r) => { if (r.isConfirmed) signOut(auth); });
    },

    // --- CRUD DO NOVO EFETIVO EM LOTE ---
    saveData: async () => {
        const d = document.getElementById('inp-data').value;
        const f1 = parseInt(document.getElementById('ef-fab-1').value) || 0;
        const f2 = parseInt(document.getElementById('ef-fab-2').value) || 0;
        const e1 = parseInt(document.getElementById('ef-est-1').value) || 0;
        const e2 = parseInt(document.getElementById('ef-est-2').value) || 0;
        const m1 = parseInt(document.getElementById('ef-mont-1').value) || 0;
        const m2 = parseInt(document.getElementById('ef-mont-2').value) || 0;
        const p1 = parseInt(document.getElementById('ef-pain-1').value) || 0;
        const p2 = parseInt(document.getElementById('ef-pain-2').value) || 0;

        if (!d) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Selecione a data de vigência.' });
        
        // Evitar zerar a fábrica sem querer
        if (f1+f2+e1+e2+m1+m2+p1+p2 === 0) return Swal.fire({ icon: 'error', title: 'Fábrica Vazia?', text: 'Preencha pelo menos um setor com capacidade válida.' });

        try {
            // Salva um documento único com a Data como ID
            await setDoc(doc(db, "efetivos_vigencia", d), {
                fab_1: f1, fab_2: f2, est_1: e1, est_2: e2,
                mont_1: m1, mont_2: m2, pain_1: p1, pain_2: p2,
                updated_at: Timestamp.now(), usuario_id: auth.currentUser.uid
            });
            
            Toast.fire({ icon: 'success', title: 'Efetivo Global Salvo!' });
            
            // Limpar campos
            ['ef-fab-1','ef-fab-2','ef-est-1','ef-est-2','ef-mont-1','ef-mont-2','ef-pain-1','ef-pain-2'].forEach(id => document.getElementById(id).value = '');
            
        } catch (e) { console.error(e); Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao salvar no banco.' }); }
    },

    deleteMarco: async (id) => { 
        Swal.fire({ title: 'Excluir Marco de Vigência?', text: 'Os indicadores voltarão a usar o marco anterior a este.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sim, excluir' }).then(async (r) => {
            if (r.isConfirmed) { await deleteDoc(doc(db, "efetivos_vigencia", id)); Toast.fire({ icon: 'success', title: 'Excluído.' }); }
        });
    },

    // --- NAVEGAÇÃO E PERFIL ---
    switchTab: (tabId) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
        const btnIndex = tabId === 'tab-lancamento' ? 0 : 1;
        document.querySelectorAll('nav button')[btnIndex].classList.add('active');
        document.getElementById(tabId).classList.add('active');
        if (tabId === 'tab-indicadores') app.updateDashboard();
    },
    
    loadUserProfile: async (uid) => {
        try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const d = snap.data();
                document.getElementById('profile-name').innerText = d.name || "Usuário";
                document.getElementById('profile-role').innerText = d.role || "Colaborador";
                const img = document.getElementById('user-avatar-img'), ph = document.getElementById('user-avatar-placeholder');
                if(d.photoUrl){ img.src=d.photoUrl; img.style.display='block'; ph.style.display='none'; } else { img.style.display='none'; ph.style.display='flex'; }
            }
        } catch(e){}
    },

    openProfileEditor: async () => {
        const uid = auth.currentUser.uid; let d = {name:'', role:'', photoUrl:''}; try { const s = await getDoc(doc(db,"users",uid)); if(s.exists()) d=s.data(); } catch(e){}
        const {value:v} = await Swal.fire({ title:'Perfil', html:`<input id="sw-n" class="swal2-input" placeholder="Nome" value="${d.name||''}"><input id="sw-r" class="swal2-input" placeholder="Cargo" value="${d.role||''}"><input id="sw-p" class="swal2-input" placeholder="Foto URL (Opcional)" value="${d.photoUrl||''}">`, preConfirm:()=>{ return {name:document.getElementById('sw-n').value, role:document.getElementById('sw-r').value, photoUrl:document.getElementById('sw-p').value} }});
        if(v) { await setDoc(doc(db,"users",uid),v,{merge:true}); Toast.fire({icon:'success',title:'Salvo'}); app.loadUserProfile(uid); }
    },

    // --- O MOTOR CROSS-DATABASE (FUSÃO DE DADOS) ---
    updateDashboard: async () => {
        const start = document.getElementById('dash-start').value;
        const end = document.getElementById('dash-end').value;
        if (!start || !end) return;

        if (marcosGlobais.length === 0) {
            return Swal.fire('Sem Efetivo', 'Cadastre o primeiro Marco de Efetivo na outra aba para gerar os gráficos.', 'info');
        }

        Swal.fire({ title: 'Cruzando Dados...', text: 'Buscando faltas no Contador de Presença', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let cacheSemanas = {}; // Evita baixar a mesma semana 5 vezes
        let stats = {
            global: { ef: 0, fa: 0 },
            plantas: { "PLANTA 3": { ef: 0, fa: 0 }, "PLANTA 4": { ef: 0, fa: 0 } },
            setores: {
                "Fabricação": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } },
                "Mont. Estrutural": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } },
                "Montagem final": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } },
                "Painéis": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } }
            },
            evolucao: {} 
        };

        let currentDate = new Date(start + "T12:00:00");
        let endDateObj = new Date(end + "T12:00:00");
        let diasUteisProcessados = 0;

        while (currentDate <= endDateObj) {
            let dayOfWeek = currentDate.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Apenas Seg a Sex
                let dateStr = currentDate.toISOString().split('T')[0];
                let weekId = getWeekId(currentDate);
                let dayIndex = dayOfWeek - 1;

                // 1. Encontra qual era o efetivo nesta data exata
                let marcoAtivo = marcosGlobais.find(m => m.id <= dateStr);
                
                if (marcoAtivo) {
                    // 2. Busca o arquivo do App 1 (Contador de Presenca)
                    if (cacheSemanas[weekId] === undefined) {
                        try {
                            let docSnap = await getDoc(doc(db, "contador_de_presenca", weekId));
                            cacheSemanas[weekId] = docSnap.exists() ? docSnap.data().dados : null;
                        } catch(e) { cacheSemanas[weekId] = null; }
                    }

                    let dadosSemanaApp1 = cacheSemanas[weekId];
                    if (dadosSemanaApp1) {
                        diasUteisProcessados++;
                        processarDiaUnico(dadosSemanaApp1, marcoAtivo, dayIndex, stats, dateStr);
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        Swal.close();
        if(diasUteisProcessados === 0) {
            Toast.fire({ icon: 'info', title: 'Nenhum lançamento no período.' });
        }
        renderDashboardUI(stats, diasUteisProcessados || 1);
    },

    exportarExcelMestre: () => {
        // Alerta Temporário - Preparando terreno para a Fase 3
        Swal.fire({
            icon: 'info',
            title: 'Fase 3: O Excel Vivo',
            text: 'O motor de dados já está pronto e cruzando as tabelas. No próximo passo, a biblioteca ExcelJS injetará essas informações cruas em planilhas com fórmulas nativas e formatação vermelha automática!',
            confirmButtonColor: '#2563eb'
        });
    }
};

// --- PROCESSAMENTO MATEMÁTICO DIÁRIO ---
function processarDiaUnico(semanaApp1, marco, dayIndex, stats, dateStr) {
    if(!stats.evolucao[dateStr]) stats.evolucao[dateStr] = { ef:0, fa:0 };

    // Mapa de Tradução: App 1 -> App 2
    const mapConfig = [
        { areaA1: 'Fabricação', turnoA1: '1º', p: 'PLANTA 3', s: 'Fabricação', t: '1º TURNO', key: 'fab_1' },
        { areaA1: 'Fabricação', turnoA1: '2º', p: 'PLANTA 3', s: 'Fabricação', t: '2º TURNO', key: 'fab_2' },
        { areaA1: 'Estrutural', turnoA1: '1º', p: 'PLANTA 3', s: 'Mont. Estrutural', t: '1º TURNO', key: 'est_1' },
        { areaA1: 'Estrutural', turnoA1: '2º', p: 'PLANTA 3', s: 'Mont. Estrutural', t: '2º TURNO', key: 'est_2' },
        { areaA1: 'Mont. Final', turnoA1: '1º', p: 'PLANTA 4', s: 'Montagem final', t: '1º TURNO', key: 'mont_1' },
        { areaA1: 'Mont. Final', turnoA1: '2º', p: 'PLANTA 4', s: 'Montagem final', t: '2º TURNO', key: 'mont_2' },
        { areaA1: 'Painéis', turnoA1: '1º', p: 'PLANTA 4', s: 'Painéis', t: '1º TURNO', key: 'pain_1' },
        { areaA1: 'Painéis', turnoA1: '2º', p: 'PLANTA 4', s: 'Painéis', t: '2º TURNO', key: 'pain_2' }
    ];

    mapConfig.forEach(cfg => {
        const linhaApp1 = semanaApp1.find(l => l.area === cfg.areaA1 && l.turno === cfg.turnoA1);
        if(linhaApp1) {
            let faltas = linhaApp1.dias[dayIndex];
            faltas = (faltas === "" || isNaN(faltas)) ? 0 : parseInt(faltas);
            let efetivo = marco[cfg.key] || 0;

            if(efetivo > 0) {
                stats.global.ef += efetivo; stats.global.fa += faltas;
                stats.plantas[cfg.p].ef += efetivo; stats.plantas[cfg.p].fa += faltas;
                stats.setores[cfg.s][cfg.t].ef += efetivo; stats.setores[cfg.s][cfg.t].fa += faltas;
                stats.evolucao[dateStr].ef += efetivo; stats.evolucao[dateStr].fa += faltas;
            }
        }
    });
}

// --- RENDERIZAÇÃO DA TELA (GRÁFICOS E CARDS) ---
function renderDashboardUI(stats, daysCount) {
    const calc = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) : "0.00"; 
    const mean = (f) => (f / daysCount).toFixed(1);

    // Cards Superiores
    document.getElementById('kpi-p3').innerText = calc(stats.plantas["PLANTA 3"].fa, stats.plantas["PLANTA 3"].ef) + "%"; 
    document.getElementById('mean-p3').innerHTML = `<i class="ph-bold ph-trend-up"></i> Faltas/dia: ` + mean(stats.plantas["PLANTA 3"].fa);
    
    document.getElementById('kpi-p4').innerText = calc(stats.plantas["PLANTA 4"].fa, stats.plantas["PLANTA 4"].ef) + "%"; 
    document.getElementById('mean-p4').innerHTML = `<i class="ph-bold ph-trend-up"></i> Faltas/dia: ` + mean(stats.plantas["PLANTA 4"].fa);
    
    const globPct = calc(stats.global.fa, stats.global.ef); 
    const elG = document.getElementById('kpi-global'); 
    elG.innerText = globPct + "%"; 
    elG.className = `val ${parseFloat(globPct)>5?'alert-text':''}`; 
    document.getElementById('mean-global').innerHTML = `<i class="ph-bold ph-globe"></i> Faltas/dia: ` + mean(stats.global.fa);

    // Limpa Grids
    const g1 = document.getElementById('grid-t1'), g2 = document.getElementById('grid-t2'), gc = document.getElementById('grid-consolidado');
    g1.innerHTML=''; g2.innerHTML=''; gc.innerHTML='';

    // Cards Detalhados e Consolidados
    Object.keys(stats.setores).sort().forEach(k => { 
        const t1 = stats.setores[k]["1º TURNO"], t2 = stats.setores[k]["2º TURNO"];
        const p1 = calc(t1.fa, t1.ef), p2 = calc(t2.fa, t2.ef);
        
        g1.innerHTML += `<div class="mini-card border-t1"><h4>${k}</h4><div class="val ${parseFloat(p1)>5?'alert-text':''}">${p1}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Faltas/dia: ${(t1.fa/daysCount).toFixed(1)}</span></div>`; 
        g2.innerHTML += `<div class="mini-card border-t2"><h4>${k}</h4><div class="val ${parseFloat(p2)>5?'alert-text':''}">${p2}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Faltas/dia: ${(t2.fa/daysCount).toFixed(1)}</span></div>`; 
        
        const totEf = t1.ef + t2.ef, totFa = t1.fa + t2.fa;
        const pt = calc(totFa, totEf);
        gc.innerHTML += `<div class="mini-card border-sector"><h4>Total ${k}</h4><div class="val ${parseFloat(pt)>5?'alert-text':''}">${pt}%</div><span class="sub-val"><i class="ph-bold ph-sigma"></i> Faltas/dia: ${(totFa/daysCount).toFixed(1)}</span></div>`; 
    });

    // Gráfico de Evolução
    const ctx = document.getElementById('chart-evolution'); 
    if (chartEvolution) chartEvolution.destroy(); 
    const keys = Object.keys(stats.evolucao).sort();
    const vals = keys.map(k => calc(stats.evolucao[k].fa, stats.evolucao[k].ef)); 
    const formatDates = keys.map(k => k.split('-').reverse().slice(0,2).join('/'));

    chartEvolution = new Chart(ctx, { 
        type: 'bar', 
        data: { labels: formatDates, datasets: [{ label: 'Absenteísmo Diário (%)', data: vals, backgroundColor: '#3b82f6', barPercentage: 0.6, borderRadius:6 }] }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { y: { beginAtZero: true, grid:{color:'#f1f5f9'} }, x:{grid:{display:false}} }, 
            plugins: { legend:{display:false}, title:{display:true, text:'Evolução Diária (Planta Inteira)', font:{size:16, family:"'Inter'", weight:600}, color:'#334155'}, datalabels:{color:'#334155', anchor:'end', align:'top', offset:-4, font:{weight:'bold'}, formatter: v => v>0?v+'%':''} } 
        } 
    });
}

// --- ESCUTADOR DO BANCO E INICIALIZAÇÃO ---
onAuthStateChanged(auth, u => {
    document.getElementById('auth-overlay').style.display = u ? 'none' : 'flex';
    document.getElementById('app-container').style.display = u ? 'flex' : 'none';
    if(u) {
        app.loadUserProfile(u.uid);
        
        // Mantém a linha do tempo do Efetivo sempre atualizada
        onSnapshot(collection(db, "efetivos_vigencia"), snap => {
            marcosGlobais = [];
            snap.forEach(doc => marcosGlobais.push({ id: doc.id, ...doc.data() }));
            
            // Ordena do mais recente para o mais antigo
            marcosGlobais.sort((a,b) => b.id.localeCompare(a.id));

            let hP3 = '', hP4 = '';
            marcosGlobais.forEach((m, i) => {
                let status = i === 0 ? '<span class="status-good">Ativo (Atual)</span>' : '<span style="color:#64748b; font-size:0.8rem;">Histórico</span>';
                let dataBr = m.id.split('-').reverse().join('/');
                const btnExcluir = `<button class="btn-logout" onclick="app.deleteMarco('${m.id}')" title="Excluir"><i class="ph-bold ph-trash"></i></button>`;
                
                const linha = (setor, turno, val) => `<tr><td>${dataBr}</td><td>${setor} <small style="color:#64748b">(${turno})</small></td><td><b>${val}</b></td><td>${status}</td><td>${btnExcluir}</td></tr>`;
                
                hP3 += linha('Fabricação', '1º T', m.fab_1) + linha('Fabricação', '2º T', m.fab_2) + linha('Mont. Estrutural', '1º T', m.est_1) + linha('Mont. Estrutural', '2º T', m.est_2);
                hP4 += linha('Montagem final', '1º T', m.mont_1) + linha('Montagem final', '2º T', m.mont_2) + linha('Painéis', '1º T', m.pain_1) + linha('Painéis', '2º T', m.pain_2);
                
                // Divisão visual entre marcos de datas diferentes
                hP3 += `<tr style="background:#f1f5f9;"><td colspan="5" style="padding:2px;"></td></tr>`;
                hP4 += `<tr style="background:#f1f5f9;"><td colspan="5" style="padding:2px;"></td></tr>`;
            });

            document.querySelector('#table-p3 tbody').innerHTML = hP3 || `<tr><td colspan="5" style="text-align:center;">Sem registros.</td></tr>`;
            document.querySelector('#table-p4 tbody').innerHTML = hP4 || `<tr><td colspan="5" style="text-align:center;">Sem registros.</td></tr>`;
        });
        
        document.getElementById('dash-start').value = "2026-03-01"; // Inicializa no mês atual para o gráfico não pesar
        const today = new Date();
        const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('dash-end').value = localToday;
    }
});
