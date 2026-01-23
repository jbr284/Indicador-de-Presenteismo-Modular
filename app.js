// Importações Oficiais do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURAÇÃO ---
// ! IMPORTANTE: Substitua pelos seus dados do Firebase Console !
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
    "PLANTA 3": ["Estrutura", "Fabricação"],
    "PLANTA 4": ["Montagem final", "Painéis"]
};

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

    // 2. UI
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

    // 4. CRUD (Excluir)
    deleteItem: async (id) => {
        if(confirm("Tem certeza que deseja excluir este registro?")) {
            await deleteDoc(doc(db, "registros_absenteismo", id));
        }
    }
};

// --- LISTENERS (Tempo Real) ---

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

setInterval(() => {
    const now = new Date();
    document.getElementById('current-datetime').innerText = now.toLocaleString('pt-BR');
}, 1000);

// Lógica Principal de Exibição (Separada por Turnos)
function startDataListener() {
    // Ordena por data (os mais recentes primeiro dentro de cada grupo)
    const q = query(collection(db, "registros_absenteismo"), orderBy("data_registro", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const tbodyP3 = document.querySelector('#table-p3 tbody');
        const tbodyP4 = document.querySelector('#table-p4 tbody');

        // Buffers para armazenar HTML separado por turno
        let p3_t1 = '', p3_t2 = '';
        let p4_t1 = '', p4_t2 = '';

        // Acumuladores Globais da Planta (para o rodapé)
        let accP3 = { efetivo: 0, faltas: 0 };
        let accP4 = { efetivo: 0, faltas: 0 };

        snapshot.forEach((doc) => {
            const data = doc.data();
            const row = `
                <tr>
                    <td>${data.data_registro.split('-').reverse().join('/')}</td>
                    <td>${data.setor}</td> <td>${data.efetivo}</td>
                    <td>${data.faltas}</td>
                    <td class="${data.absenteismo_percentual > 5 ? 'status-bad' : ''}">
                        ${data.absenteismo_percentual.toFixed(2)}%
                    </td>
                    <td>
                        <button class="danger-btn" onclick="app.deleteItem('${doc.id}')">Excluir</button>
                    </td>
                </tr>
            `;

            // Lógica de Separação (Planta -> Turno)
            if (data.planta === "PLANTA 3") {
                accP3.efetivo += data.efetivo;
                accP3.faltas += data.faltas;
                
                if (data.turno === "1º TURNO") p3_t1 += row;
                else p3_t2 += row;

            } else if (data.planta === "PLANTA 4") {
                accP4.efetivo += data.efetivo;
                accP4.faltas += data.faltas;

                if (data.turno === "1º TURNO") p4_t1 += row;
                else p4_t2 += row;
            }
        });

        // Montagem Final da Tabela P3
        let finalHtmlP3 = '';
        if (p3_t1) finalHtmlP3 += `<tr class="turn-header"><td colspan="6">1º TURNO</td></tr>` + p3_t1;
        if (p3_t2) finalHtmlP3 += `<tr class="turn-header"><td colspan="6">2º TURNO</td></tr>` + p3_t2;
        finalHtmlP3 += generateTotalRow(accP3); // Total sempre ao final

        // Montagem Final da Tabela P4
        let finalHtmlP4 = '';
        if (p4_t1) finalHtmlP4 += `<tr class="turn-header"><td colspan="6">1º TURNO</td></tr>` + p4_t1;
        if (p4_t2) finalHtmlP4 += `<tr class="turn-header"><td colspan="6">2º TURNO</td></tr>` + p4_t2;
        finalHtmlP4 += generateTotalRow(accP4); // Total sempre ao final

        tbodyP3.innerHTML = finalHtmlP3;
        tbodyP4.innerHTML = finalHtmlP4;
    });
}

// Função auxiliar para gerar a linha de Total
function generateTotalRow(acc) {
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
}
