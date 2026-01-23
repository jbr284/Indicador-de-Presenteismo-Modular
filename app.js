// Importações Oficiais do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp, where, getDocs, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURAÇÃO ---
const firebaseConfig = {
  apiKey: "AIzaSyAZsg2GbxrgX70VZwPHiXkoFMCTt7i3_6U",
  authDomain: "indicador-de-presenca-modular.firebaseapp.com",
  projectId: "indicador-de-presenca-modular",
  storageBucket: "indicador-de-presenca-modular.firebasestorage.app",
  messagingSenderId: "895253390208",
  appId: "1:895253390208:web:943f8679a0dbf36a531765"
};

// Inicialização
const appFire = initializeApp(firebaseConfig);
const db = getFirestore(appFire);
const auth = getAuth(appFire);

// --- DADOS DO NEGÓCIO ---
const estruturaSetores = {
    "PLANTA 3": ["Montagem Estrutural", "Fabricação"],
    "PLANTA 4": ["Montagem final", "Painéis"]
};

// Variáveis Globais para os Gráficos
let chartEvolution = null;
let chartSectors = null;

// Interface Global
window.app = {
    
    // 1. Autenticação
    login: async () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            document.getElementById('auth-error').innerText = "Erro: " + error.message;
        }
    },

    logout: () => signOut(auth),

    // 2. UI - Navegação
    switchTab: (tabId) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        document.getElementById(tabId).classList.add('active');
        event.target.classList.add('active');

        if (tabId === 'tab-indicadores') {
            app.updateDashboard();
        }
    },

    updateSectors: () => {
        const planta = document.getElementById('inp-planta').value;
        const setorSelect = document.getElementById('inp-setor');
        setorSelect.innerHTML = '<option value="">Selecione...</option>';
        
        if (estruturaSetores[planta]) {
            estruturaSetores[planta].forEach(setor => {
                const opt = document.createElement('option');
                opt.value = setor;
                opt.innerText = setor;
                setorSelect.appendChild(opt);
            });
        }
    },

    // --- NOVO RECURSO: CARREGAR EFETIVO AUTOMÁTICO ---
    loadHeadcount: async () => {
        const planta = document.getElementById('inp-planta').value;
        const turno = document.getElementById('inp-turno').value;
        const setor = document.getElementById('inp-setor').value;
        const efetivoInput = document.getElementById('inp-efetivo');

        // Só busca se os 3 campos estiverem preenchidos
        if (!planta || !turno || !setor) return;

        // Cria um ID único para essa combinação (ex: "PLANTA 3_1º TURNO_Fabricação")
        const configId = `${planta}_${turno}_${setor}`;

        try {
            efetivoInput.placeholder = "Buscando...";
            const docRef = doc(db, "config_efetivo", configId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                efetivoInput.value = docSnap.data().efetivo_atual;
            } else {
                // Se nunca foi salvo, deixa vazio ou zero
                efetivoInput.value = "";
                efetivoInput.placeholder = "Digite o efetivo inicial...";
            }
        } catch (e) {
            console.error("Erro ao buscar efetivo:", e);
        }
    },

    // 3. CRUD (Salvar)
    saveData: async () => {
        const planta = document.getElementById('inp-planta').value;
        const turno = document.getElementById('inp-turno').value;
        const setor = document.getElementById('inp-setor').value;
        const dataRaw = document.getElementById('inp-data').value;
        const efetivo = Number(document.getElementById('inp-efetivo').value);
        const faltas = Number(document.getElementById('inp-faltas').value);

        if (!planta || !setor || !dataRaw || efetivo <= 0) {
            alert("Por favor, preencha todos os campos corretamente.");
            return;
        }

        const absenteismo = (faltas / efetivo) * 100;
        const configId = `${planta}_${turno}_${setor}`;

        try {
            // Passo 1: Salva o Histórico (Log)
            await addDoc(collection(db, "registros_absenteismo"), {
                planta,
                turno,
                setor,
                data_registro: dataRaw,
                timestamp: Timestamp.now(),
                efetivo,
                faltas,
                absenteismo_percentual: parseFloat(absenteismo.toFixed(2)),
                usuario_id: auth.currentUser.uid
            });

            // Passo 2: Atualiza a Configuração do Efetivo (Atualiza o padrão) [NOVO]
            await setDoc(doc(db, "config_efetivo", configId), {
                efetivo_atual: efetivo,
                ultima_atualizacao: Timestamp.now()
            }, { merge: true });

            alert("Registro salvo e efetivo atualizado!");
        } catch (e) {
            console.error("Erro ao salvar", e);
            alert("Erro ao salvar no banco de dados.");
        }
    },

    // 4. CRUD (Excluir)
    deleteItem: async (id) => {
        if(confirm("Tem certeza que deseja excluir este registro?")) {
            await deleteDoc(doc(db, "registros_absenteismo", id));
        }
    },

    // 5. DASHBOARD & INDICADORES
    updateDashboard: async () => {
        const start = document.getElementById('dash-start').value;
        const end = document.getElementById('dash-end').value;

        if (!start || !end) return;

        const q = query(
            collection(db, "registros_absenteismo"),
            where("data_registro", ">=", start),
            where("data_registro", "<=", end),
            orderBy("data_registro", "asc")
        );

        const snapshot = await getDocs(q);
        processChartData(snapshot);
    },
};

// --- LOGICA DE PROCESSAMENTO DE DADOS (KPIs + Gráficos) ---
function processChartData(snapshot) {
    let totalP3 = { efetivo: 0, faltas: 0 };
    let totalP4 = { efetivo: 0, faltas: 0 };
    let timeline = {}; 
    let sectors = {}; 

    snapshot.forEach(doc => {
        const d = doc.data();
        
        if (d.planta === "PLANTA 3") {
            totalP3.efetivo += d.efetivo;
            totalP3.faltas += d.faltas;
        } else {
            totalP4.efetivo += d.efetivo;
            totalP4.faltas += d.faltas;
        }

        if (!timeline[d.data_registro]) {
            timeline[d.data_registro] = { p3_ef: 0, p3_fa: 0, p4_ef: 0, p4_fa: 0 };
        }
        if (d.planta === "PLANTA 3") {
            timeline[d.data_registro].p3_ef += d.efetivo;
            timeline[d.data_registro].p3_fa += d.faltas;
        } else {
            timeline[d.data_registro].p4_ef += d.efetivo;
            timeline[d.data_registro].p4_fa += d.faltas;
        }

        if (!sectors[d.setor]) sectors[d.setor] = { efetivo: 0, faltas: 0 };
        sectors[d.setor].efetivo += d.efetivo;
        sectors[d.setor].faltas += d.faltas;
    });

    const calcAbs = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) : "0.00";
    
    const kpiP3 = calcAbs(totalP3.faltas, totalP3.efetivo);
    const kpiP4 = calcAbs(totalP4.faltas, totalP4.efetivo);
    const kpiGlobal = calcAbs(totalP3.faltas + totalP4.faltas, totalP3.efetivo + totalP4.efetivo);

    document.getElementById('kpi-p3').innerText = `${kpiP3}%`;
    document.getElementById('kpi-p4').innerText = `${kpiP4}%`;
    document.getElementById('kpi-global').innerText = `${kpiGlobal}%`;
    
    document.getElementById('kpi-global').className = `kpi-value ${kpiGlobal > 5 ? 'alert' : ''}`;

    const labels = Object.keys(timeline).sort();
    const dataP3 = labels.map(date => {
        const t = timeline[date];
        return t.p3_ef > 0 ? ((t.p3_fa / t.p3_ef) * 100).toFixed(2) : 0;
    });
    const dataP4 = labels.map(date => {
        const t = timeline[date];
        return t.p4_ef > 0 ? ((t.p4_fa / t.p4_ef) * 100).toFixed(2) : 0;
    });

    const sectorLabels = Object.keys(sectors);
    const sectorData = sectorLabels.map(s => {
        return sectors[s].efetivo > 0 ? ((sectors[s].faltas / sectors[s].efetivo) * 100).toFixed(2) : 0;
    });

    renderCharts(labels, dataP3, dataP4, sectorLabels, sectorData);
}

function renderCharts(dates, p3Vals, p4Vals, secLabels, secVals) {
    const ctxEvo = document.getElementById('chart-evolution');
    const ctxSec = document.getElementById('chart-sectors');

    if (chartEvolution) chartEvolution.destroy();
    if (chartSectors) chartSectors.destroy();

    chartEvolution = new Chart(ctxEvo, {
        type: 'line',
        data: {
            labels: dates.map(d => d.split('-').reverse().join('/')),
            datasets: [
                { label: 'Planta 3', data: p3Vals, borderColor: '#2563eb', tension: 0.3 },
                { label: 'Planta 4', data: p4Vals, borderColor: '#10b981', tension: 0.3 }
            ]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, title: {display: true, text: '% Absenteísmo'} } } }
    });

    chartSectors = new Chart(ctxSec, {
        type: 'bar',
        data: {
            labels: secLabels,
            datasets: [{
                label: '% Absenteísmo por Setor',
                data: secVals,
                backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981']
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}


// --- LISTENERS (Tempo Real) ---

onAuthStateChanged(auth, (user) => {
    const overlay = document.getElementById('auth-overlay');
    const appContainer = document.getElementById('app-container');
    
    if (user) {
        overlay.style.display = 'none';
        appContainer.style.display = 'block';
        startDataListener(); 
        
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        document.getElementById('dash-start').value = firstDay;
        document.getElementById('dash-end').value = lastDay;

    } else {
        overlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

setInterval(() => {
    const now = new Date();
    document.getElementById('current-datetime').innerText = now.toLocaleString('pt-BR');
}, 1000);

function startDataListener() {
    const q = query(collection(db, "registros_absenteismo"), orderBy("data_registro", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const tbodyP3 = document.querySelector('#table-p3 tbody');
        const tbodyP4 = document.querySelector('#table-p4 tbody');

        let p3_t1 = '', p3_t2 = '';
        let p4_t1 = '', p4_t2 = '';
        let accP3 = { efetivo: 0, faltas: 0 };
        let accP4 = { efetivo: 0, faltas: 0 };

        snapshot.forEach((doc) => {
            const data = doc.data();
            const row = `
                <tr>
                    <td>${data.data_registro.split('-').reverse().join('/')}</td>
                    <td>${data.setor}</td>
                    <td>${data.efetivo}</td>
                    <td>${data.faltas}</td>
                    <td class="${data.absenteismo_percentual > 5 ? 'status-bad' : ''}">
                        ${data.absenteismo_percentual.toFixed(2)}%
                    </td>
                    <td><button class="danger-btn" onclick="app.deleteItem('${doc.id}')">Excluir</button></td>
                </tr>
            `;

            if (data.planta === "PLANTA 3") {
                accP3.efetivo += data.efetivo;
                accP3.faltas += data.faltas;
                if (data.turno === "1º TURNO") p3_t1 += row; else p3_t2 += row;
            } else if (data.planta === "PLANTA 4") {
                accP4.efetivo += data.efetivo;
                accP4.faltas += data.faltas;
                if (data.turno === "1º TURNO") p4_t1 += row; else p4_t2 += row;
            }
        });

        const generateTotalRow = (acc) => {
            if (acc.efetivo === 0) return '';
            const totalAbs = (acc.faltas / acc.efetivo) * 100;
            return `
                <tr class="total-row">
                    <td colspan="2" style="text-align: right;">MÉDIA GERAL DO PERÍODO:</td>
                    <td>${acc.efetivo}</td>
                    <td>${acc.faltas}</td>
                    <td class="${totalAbs > 5 ? 'status-bad' : ''}">${totalAbs.toFixed(2)}%</td>
                    <td>-</td>
                </tr>
            `;
        };

        let finalHtmlP3 = '';
        if (p3_t1) finalHtmlP3 += `<tr class="turn-header"><td colspan="6">1º TURNO</td></tr>` + p3_t1;
        if (p3_t2) finalHtmlP3 += `<tr class="turn-header"><td colspan="6">2º TURNO</td></tr>` + p3_t2;
        finalHtmlP3 += generateTotalRow(accP3);

        let finalHtmlP4 = '';
        if (p4_t1) finalHtmlP4 += `<tr class="turn-header"><td colspan="6">1º TURNO</td></tr>` + p4_t1;
        if (p4_t2) finalHtmlP4 += `<tr class="turn-header"><td colspan="6">2º TURNO</td></tr>` + p4_t2;
        finalHtmlP4 += generateTotalRow(accP4);

        tbodyP3.innerHTML = finalHtmlP3;
        tbodyP4.innerHTML = finalHtmlP4;
    });
}
