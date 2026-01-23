import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp, where, getDocs, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// CONFIGURAÇÃO
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

const estruturaSetores = {
    "PLANTA 3": ["Montagem Estrutural", "Fabricação"],
    "PLANTA 4": ["Montagem final", "Painéis"]
};

let chartEvolution = null;
Chart.register(ChartDataLabels);

window.app = {
    login: async () => {
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value);
        } catch (e) { document.getElementById('auth-error').innerText = e.message; }
    },
    logout: () => signOut(auth),

    switchTab: (tabId) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        event.target.classList.add('active');
        if (tabId === 'tab-indicadores') app.updateDashboard();
    },

    updateSectors: () => {
        const p = document.getElementById('inp-planta').value;
        const s = document.getElementById('inp-setor');
        s.innerHTML = '<option value="">Selecione...</option>';
        if (estruturaSetores[p]) estruturaSetores[p].forEach(x => s.innerHTML += `<option value="${x}">${x}</option>`);
    },

    loadHeadcount: async () => {
        const p = document.getElementById('inp-planta').value, t = document.getElementById('inp-turno').value, s = document.getElementById('inp-setor').value;
        const inp = document.getElementById('inp-efetivo');
        if (!p || !t || !s) return;
        inp.placeholder = "Buscando...";
        try {
            const snap = await getDoc(doc(db, "config_efetivo", `${p}_${t}_${s}`));
            if (snap.exists()) inp.value = snap.data().efetivo_atual;
            else { inp.value = ""; inp.placeholder = "Digite..."; }
        } catch (e) { console.error(e); }
    },

    saveData: async () => {
        const p = document.getElementById('inp-planta').value, t = document.getElementById('inp-turno').value, s = document.getElementById('inp-setor').value;
        const d = document.getElementById('inp-data').value, ef = Number(document.getElementById('inp-efetivo').value), fa = Number(document.getElementById('inp-faltas').value);
        if (!p || !s || !d || ef <= 0) return alert("Preencha tudo.");
        try {
            await addDoc(collection(db, "registros_absenteismo"), {
                planta: p, turno: t, setor: s, data_registro: d, timestamp: Timestamp.now(),
                efetivo: ef, faltas: fa, absenteismo_percentual: parseFloat(((fa/ef)*100).toFixed(2)),
                usuario_id: auth.currentUser.uid
            });
            await setDoc(doc(db, "config_efetivo", `${p}_${t}_${s}`), { efetivo_atual: ef, ultima_atualizacao: Timestamp.now() }, { merge: true });
            alert("Salvo!");
        } catch (e) { alert("Erro ao salvar."); }
    },

    deleteItem: async (id) => { if(confirm("Excluir?")) await deleteDoc(doc(db, "registros_absenteismo", id)); },

    updateDashboard: async () => {
        const start = document.getElementById('dash-start').value, end = document.getElementById('dash-end').value;
        if (!start || !end) return;
        const q = query(collection(db, "registros_absenteismo"), where("data_registro", ">=", start), where("data_registro", "<=", end), orderBy("data_registro", "asc"));
        processChartData(await getDocs(q), start, end);
    }
};

function processChartData(snapshot, startDate, endDate) {
    let global = { ef: 0, fa: 0 };
    let plants = { "PLANTA 3": { ef:0, fa:0 }, "PLANTA 4": { ef:0, fa:0 } };
    let sectorStats = {}; 
    let sectorTotals = {}; 
    let uniqueDays = new Set();

    snapshot.forEach(doc => {
        const d = doc.data();
        uniqueDays.add(d.data_registro);
        global.ef += d.efetivo; global.fa += d.faltas;
        if(plants[d.planta]) { plants[d.planta].ef += d.efetivo; plants[d.planta].fa += d.faltas; }
        if(!sectorStats[d.setor]) sectorStats[d.setor] = { "1º TURNO": {ef:0, fa:0}, "2º TURNO": {ef:0, fa:0} };
        if(sectorStats[d.setor][d.turno]) { sectorStats[d.setor][d.turno].ef += d.efetivo; sectorStats[d.setor][d.turno].fa += d.faltas; }
        if(!sectorTotals[d.setor]) sectorTotals[d.setor] = { ef: 0, fa: 0 };
        sectorTotals[d.setor].ef += d.efetivo; sectorTotals[d.setor].fa += d.faltas;
    });

    const daysCount = uniqueDays.size || 1;
    const calc = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) : "0.00";
    const mean = (f) => (f / daysCount).toFixed(1);

    document.getElementById('kpi-p3').innerText = calc(plants["PLANTA 3"].fa, plants["PLANTA 3"].ef) + "%";
    document.getElementById('mean-p3').innerText = "Média: " + mean(plants["PLANTA 3"].fa);
    document.getElementById('kpi-p4').innerText = calc(plants["PLANTA 4"].fa, plants["PLANTA 4"].ef) + "%";
    document.getElementById('mean-p4').innerText = "Média: " + mean(plants["PLANTA 4"].fa);
    const globPct = calc(global.fa, global.ef);
    const globEl = document.getElementById('kpi-global');
    globEl.innerText = globPct + "%";
    globEl.className = `val ${parseFloat(globPct) > 5 ? 'alert-text' : ''}`;
    document.getElementById('mean-global').innerText = "Média: " + mean(global.fa);

    renderDetailedCards(sectorStats, daysCount);
    renderConsolidatedCards(sectorTotals, daysCount);
    renderEvolutionChart(sectorTotals, startDate, endDate);
}

function renderDetailedCards(sectorStats, daysCount) {
    const gridT1 = document.getElementById('grid-t1'), gridT2 = document.getElementById('grid-t2');
    gridT1.innerHTML = ''; gridT2.innerHTML = '';
    Object.keys(sectorStats).sort().forEach(sector => {
        const t1 = sectorStats[sector]["1º TURNO"], t2 = sectorStats[sector]["2º TURNO"];
        const pct1 = t1.ef > 0 ? ((t1.fa/t1.ef)*100).toFixed(2) : "0.00";
        const pct2 = t2.ef > 0 ? ((t2.fa/t2.ef)*100).toFixed(2) : "0.00";
        gridT1.innerHTML += `<div class="mini-card border-t1"><h4>${sector}</h4><div class="val ${parseFloat(pct1)>5?'alert-text':''}">${pct1}%</div><span class="sub-val">Média: ${(t1.fa/daysCount).toFixed(1)}</span></div>`;
        gridT2.innerHTML += `<div class="mini-card border-t2"><h4>${sector}</h4><div class="val ${parseFloat(pct2)>5?'alert-text':''}">${pct2}%</div><span class="sub-val">Média: ${(t2.fa/daysCount).toFixed(1)}</span></div>`;
    });
}

function renderConsolidatedCards(sectorTotals, daysCount) {
    const grid = document.getElementById('grid-consolidado');
    grid.innerHTML = '';
    Object.keys(sectorTotals).sort().forEach(sector => {
        const t = sectorTotals[sector];
        const pct = t.ef > 0 ? ((t.fa/t.ef)*100).toFixed(2) : "0.00";
        grid.innerHTML += `<div class="mini-card border-sector"><h4>Total ${sector}</h4><div class="val ${parseFloat(pct)>5?'alert-text':''}">${pct}%</div><span class="sub-val">Média Dia: ${(t.fa/daysCount).toFixed(1)}</span></div>`;
    });
}

function renderEvolutionChart(sectorTotals, startDate, endDate) {
    const ctx = document.getElementById('chart-evolution');
    if (chartEvolution) chartEvolution.destroy();
    const sectors = Object.keys(sectorTotals).sort();
    const values = sectors.map(s => { const t = sectorTotals[s]; return t.ef > 0 ? parseFloat(((t.fa/t.ef)*100).toFixed(2)) : 0; });
    const bgColors = sectors.map(s => `hsl(${s.split('').reduce((a,b)=>a+b.charCodeAt(0),0) % 360}, 70%, 50%)`);
    const fmt = (dt) => dt ? dt.split('-').reverse().join('/') : '...';
    
    chartEvolution = new Chart(ctx, {
        type: 'bar',
        data: { labels: sectors, datasets: [{ label: 'Absenteísmo Acumulado', data: values, backgroundColor: bgColors, barPercentage: 0.6 }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: {display:true, text:'% Absenteísmo'} }, x: { title:{display:true, text:'Setores'} } },
            plugins: { 
                legend: { display: false },
                title: { display: true, text: 'Absenteísmo Acumulado por Setor', font: {size:16} },
                subtitle: { display: true, text: `Período: ${fmt(startDate)} até ${fmt(endDate)}`, position: 'bottom', padding:{top:10} },
                datalabels: { color:'#000', anchor:'end', align:'top', offset:-4, font:{weight:'bold', size:11}, formatter: (v,c) => v>0 ? `${c.chart.data.labels[c.dataIndex]}\n${v}%` : '', textAlign: 'center' }
            }
        }
    });
}

onAuthStateChanged(auth, u => {
    document.getElementById('auth-overlay').style.display = u ? 'none' : 'flex';
    document.getElementById('app-container').style.display = u ? 'block' : 'none';
    if(u) {
        onSnapshot(query(collection(db, "registros_absenteismo"), orderBy("data_registro", "desc")), snap => {
            const p3 = document.querySelector('#table-p3 tbody'), p4 = document.querySelector('#table-p4 tbody');
            let h3_1='', h3_2='', h4_1='', h4_2='', t3={e:0,f:0}, t4={e:0,f:0};
            snap.forEach(doc => {
                const d = doc.data(), id = doc.id;
                const row = `<tr><td>${d.data_registro.split('-').reverse().join('/')}</td><td>${d.setor}</td><td>${d.efetivo}</td><td>${d.faltas}</td><td class="${d.absenteismo_percentual>5?'status-bad':''}">${d.absenteismo_percentual.toFixed(2)}%</td><td><button class="danger-btn" onclick="app.deleteItem('${id}')">X</button></td></tr>`;
                if(d.planta==="PLANTA 3") { t3.e+=d.efetivo; t3.f+=d.faltas; if(d.turno==="1º TURNO") h3_1+=row; else h3_2+=row; } else { t4.e+=d.efetivo; t4.f+=d.faltas; if(d.turno==="1º TURNO") h4_1+=row; else h4_2+=row; }
            });
            const tot = (t) => t.e>0 ? `<tr class="total-row"><td colspan="2">TOTAL</td><td>${t.e}</td><td>${t.f}</td><td class="${(t.f/t.e*100)>5?'status-bad':''}">${(t.f/t.e*100).toFixed(2)}%</td><td>-</td></tr>` : '';
            p3.innerHTML = (h3_1 ? `<tr class="turn-header"><td colspan="6">1º Turno</td></tr>`+h3_1:'') + (h3_2 ? `<tr class="turn-header"><td colspan="6">2º Turno</td></tr>`+h3_2:'') + tot(t3);
            p4.innerHTML = (h4_1 ? `<tr class="turn-header"><td colspan="6">1º Turno</td></tr>`+h4_1:'') + (h4_2 ? `<tr class="turn-header"><td colspan="6">2º Turno</td></tr>`+h4_2:'') + tot(t4);
        });
        const d = new Date(), y = d.getFullYear(), m = d.getMonth();
        document.getElementById('dash-start').value = new Date(y, m, 1).toISOString().split('T')[0];
        document.getElementById('dash-end').value = new Date(y, m+1, 0).toISOString().split('T')[0];
    }
});
