// Importações Oficiais do Firebase v9+ (Padrão de Mercado)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURAÇÃO (COLE O SEU AQUI) ---
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

// --- ESTADO E DADOS DO NEGÓCIO ---
// Definição dos Setores por Planta 
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
            // O observer (onAuthStateChanged) vai lidar com a UI
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
        // Adiciona classe active no botão clicado (lógica simplificada)
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
        // Coleta de dados
        const planta = document.getElementById('inp-planta').value;
        const turno = document.getElementById('inp-turno').value;
        const setor = document.getElementById('inp-setor').value;
        const dataRaw = document.getElementById('inp-data').value; // YYYY-MM-DD
        const efetivo = Number(document.getElementById('inp-efetivo').value);
        const faltas = Number(document.getElementById('inp-faltas').value);

        // Validação básica
        if (!planta || !setor || !dataRaw || efetivo <= 0) {
            alert("Por favor, preencha todos os campos corretamente.");
            return;
        }

        // Cálculo de Negócio 
        // Regra de três: (Faltas * 100) / Efetivo
        const absenteismo = (faltas / efetivo) * 100;

        try {
            await addDoc(collection(db, "registros_absenteismo"), {
                planta,
                turno,
                setor,
                data_registro: dataRaw, // String para filtro fácil
                timestamp: Timestamp.now(), // Para auditoria
                efetivo,
                faltas,
                absenteismo_percentual: parseFloat(absenteismo.toFixed(2)),
                usuario_id: auth.currentUser.uid // Segurança: quem registrou?
            });
            
            alert("Registro salvo com sucesso!");
            // Limpar formulário (opcional)
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
        startDataListener(); // Começa a baixar dados apenas se logado
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

// 3. Monitorar Banco de Dados (Real-time) 
function startDataListener() {
    const q = query(collection(db, "registros_absenteismo"), orderBy("data_registro", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const tbodyP3 = document.querySelector('#table-p3 tbody');
        const tbodyP4 = document.querySelector('#table-p4 tbody');
        
        tbodyP3.innerHTML = '';
        tbodyP4.innerHTML = '';

        snapshot.forEach((doc) => {
            const data = doc.data();
            const row = `
                <tr>
                    <td>${data.data_registro.split('-').reverse().join('/')}</td>
                    <td>${data.setor} (${data.turno})</td>
                    <td>${data.efetivo}</td>
                    <td>${data.faltas}</td>
                    <td class="${data.absenteismo_percentual > 5 ? 'status-bad' : ''}">
                        ${data.absenteismo_percentual}%
                    </td>
                    <td>
                        <button class="danger-btn" onclick="app.deleteItem('${doc.id}')">Excluir</button>
                    </td>
                </tr>
            `;

            // Separação por Abas/Plantas 
            if (data.planta === "PLANTA 3") {
                tbodyP3.innerHTML += row;
            } else if (data.planta === "PLANTA 4") {
                tbodyP4.innerHTML += row;
            }
        });
    });
}