// Importações Oficiais do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURAÇÃO ---
// ! IMPORTANTE: Substitua pelos seus dados do Firebase Console novamente !
const firebaseConfig = {
    apiKey: "SUA_API_KEY_AQUI",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    projectId: "SEU_PROJETO",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};

// Inicialização
const appFire = initializeApp(firebaseConfig);
const db = getFirestore(appFire);
const auth = getAuth(appFire);

// --- ESTADO E DADOS DO NEGÓCIO ---
const estruturaSetores = {
    "PLANTA 3": ["Estrutura", "Fabricação"],
    "PLANTA 4": ["Montagem final", "Painéis"]
};

// Interface Global para o HTML acessar
window.app = {
    
    // --- 1. Lógica de Autenticação ---
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

    // --- 2. Lógica de UI (Abas e Formulários) ---
    switchTab: (tabId) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        document.getElementById(tabId).classList.add('active');
        event.target.classList.add('active');
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

    // --- 3. CRUD: Create (Salvar) ---
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

        try {
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
            
            alert("Registro salvo com sucesso!");
        } catch (e) {
            console.error("Erro ao salvar", e);
            alert("Erro ao salvar no banco de dados.");
        }
    },

    // --- 4. CRUD: Delete ---
    deleteItem: async (id) => {
        if(confirm("Tem certeza que deseja excluir este registro?")) {
            await deleteDoc(doc(db, "registros_absenteismo", id));
        }
    }
};

// --- LISTENERS (Tempo Real) ---

// 1. Monitorar Login
onAuthStateChanged(auth, (user) => {
    const overlay = document.getElementById('auth-overlay');
    const appContainer = document.getElementById('app-container');
    
    if (user) {
        overlay.style.display = 'none';
        appContainer.style.display = 'block';
        startDataListener();
    } else {
        overlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

// 2. Atualizar Data/Hora
setInterval(() => {
    const now = new Date();
    document.getElementById('current-datetime').innerText = now.toLocaleString('pt-BR');
}, 1000);

// 3. Monitorar Banco de Dados (Real-time com Totalizador)
function startDataListener() {
    const q = query(collection(db, "registros_absenteismo"), orderBy("data_registro", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const tbodyP3 = document.querySelector('#table-p3 tbody');
        const tbodyP4 = document.querySelector('#table-p4 tbody');
        
        let htmlP3 = '';
        let htmlP4 = '';

        // Acumuladores para o Total
        let accP3 = { efetivo: 0, faltas: 0 };
        let accP4 = { efetivo: 0, faltas: 0 };

        snapshot.forEach((doc) => {
            const data = doc.data();
            const row = `
                <tr>
                    <td>${data.data_registro.split('-').reverse().join('/')}</td>
                    <td>${data.setor} (${data.turno})</td>
                    <td>${data.efetivo}</td>
                    <td>${data.faltas}</td>
                    <td class="${data.absenteismo_percentual > 5 ? 'status-bad' : ''}">
                        ${data.absenteismo_percentual.toFixed(2)}%
                    </td>
                    <td>
                        <button class="danger-btn" onclick="app.deleteItem('${doc.id}')">Excluir</button>
                    </td>
                </tr>
            `;

            if (data.planta === "PLANTA 3") {
                htmlP3 += row;
                accP3.efetivo += data.efetivo;
                accP3.faltas += data.faltas;
            } else if (data.planta === "PLANTA 4") {
                htmlP4 += row;
                accP4.efetivo += data.efetivo;
                accP4.faltas += data.faltas;
            }
        });

        // Função interna para gerar a linha de Total
        const generateTotalRow = (acc) => {
            if (acc.efetivo === 0) return '';
            const totalAbs = (acc.faltas / acc.efetivo) * 100;
            return `
                <tr class="total-row">
                    <td colspan="2" style="text-align: right;">MÉDIA GERAL DO PERÍODO:</td>
                    <td>${acc.efetivo}</td>
                    <td>${acc.faltas}</td>
                    <td class="${totalAbs > 5 ? 'status-bad' : ''}">
                        ${totalAbs.toFixed(2)}%
                    </td>
                    <td>-</td>
                </tr>
            `;
        };

        tbodyP3.innerHTML = htmlP3 + generateTotalRow(accP3);
        tbodyP4.innerHTML = htmlP4 + generateTotalRow(accP4);
    });
}
