import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp, where, getDocs, setDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

const estruturaSetores = {
    "PLANTA 3": ["Montagem Estrutural", "Fabricação"],
    "PLANTA 4": ["Montagem final", "Painéis"]
};

let chartEvolution = null;
Chart.register(ChartDataLabels);

const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
    didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
});

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

    // --- NOVA FUNÇÃO: LIMPAR BANCO ---
    wipeData: async () => {
        const confirm = await Swal.fire({
            title: 'Cuidado! Ação Irreversível',
            text: "Isso apagará TODOS os registros. Deseja continuar?",
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sim, apagar tudo'
        });

        if (confirm.isConfirmed) {
            Swal.fire({title: 'Apagando...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
            try {
                const q = query(collection(db, "registros_absenteismo"));
                const snapshot = await getDocs(q);
                if (snapshot.empty) return Swal.fire('Vazio', 'Não há registros.', 'info');

                let batch = writeBatch(db);
                let count = 0;
                for (const doc of snapshot.docs) {
                    batch.delete(doc.ref);
                    count++;
                    if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
                }
                await batch.commit();
                Swal.fire('Limpo!', `${count} registros apagados.`, 'success');
            } catch (err) { console.error(err); Swal.fire('Erro', 'Falha ao limpar.', 'error'); }
        }
    },

    // --- IMPORTAÇÃO EXCEL "SCANNER" (CORRIGIDA) ---
    processExcel: async (input) => {
        const file = input.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array', cellDates: true});
            
            let dataBatch = [];
            let turnoAtual = "1º TURNO"; // Começa assumindo 1º turno

            // Varre TODAS as abas da planilha
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

                // Varre LINHA por LINHA procurando dados e mudanças de turno
                rows.forEach((row) => {
                    const linhaTexto = JSON.stringify(row).toLowerCase();

                    // DETECÇÃO DE MUDANÇA DE TURNO
                    if (linhaTexto.includes("2º turno") || linhaTexto.includes("2 turno") || linhaTexto.includes("segundo turno")) {
                        turnoAtual = "2º TURNO";
                        return; // Pula a linha de cabeçalho
                    }
                    if (linhaTexto.includes("1º turno") || linhaTexto.includes("1 turno") || linhaTexto.includes("primeiro turno")) {
                        turnoAtual = "1º TURNO";
                        return; // Pula a linha de cabeçalho
                    }

                    // Tenta extrair a data da coluna A (índice 0)
                    let cellData = row[0];
                    if (!cellData) return;

                    let dataFormatada = null;
                    // Verifica se é data válida
                    if (cellData instanceof Date && !isNaN(cellData)) {
                        dataFormatada = cellData.toISOString().split('T')[0];
                    } else if (typeof cellData === 'string' && cellData.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        dataFormatada = cellData;
                    }

                    // Se não tem data válida na coluna A, não é uma linha de registro
                    if (!dataFormatada) return;

                    // Mapeamento das colunas (Igual ao anterior)
                    if(isValid(row[1])) dataBatch.push(createRecord("PLANTA 3", "Fabricação", turnoAtual, dataFormatada, row[1], row[2]));
                    if(isValid(row[4])) dataBatch.push(createRecord("PLANTA 3", "Montagem Estrutural", turnoAtual, dataFormatada, row[4], row[5]));
                    if(isValid(row[7])) dataBatch.push(createRecord("PLANTA 4", "Montagem final", turnoAtual, dataFormatada, row[7], row[8]));
                    if(isValid(row[10])) dataBatch.push(createRecord("PLANTA 4", "Painéis", turnoAtual, dataFormatada, row[10], row[11]));
                });
            });

            if (dataBatch.length === 0) return Swal.fire('Aviso', 'Nenhum dado válido encontrado. Verifique se a Coluna A possui datas.', 'warning');

            // Conta quantos de cada turno para exibir no alerta
            const t1 = dataBatch.filter(d => d.turno === "1º TURNO").length;
            const t2 = dataBatch.filter(d => d.turno === "2º TURNO").length;

            const confirm = await Swal.fire({
                title: 'Importar Dados?',
                html: `
                    <div style="text-align:left; font-size:0.9rem;">
                        <p>Total de Registros: <b>${dataBatch.length}</b></p>
                        <ul style="margin-top:5px;">
                            <li>1º Turno: ${t1} registros</li>
                            <li>2º Turno: ${t2} registros</li>
                        </ul>
                    </div>
                `,
                icon: 'info', showCancelButton: true, confirmButtonText: 'Confirmar Importação'
            });

            if (confirm.isConfirmed) {
                let count = 0;
                let batch = writeBatch(db);
                Swal.fire({title: 'Processando...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

                for (const rec of dataBatch) {
                    batch.set(doc(collection(db, "registros_absenteismo")), rec);
                    count++;
                    if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
                }
                await batch.commit();
                Swal.fire('Sucesso!', 'Dados importados com sucesso.', 'success');
                input.value = ""; 
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // --- PERFIL ---
    loadUserProfile: async (uid) => {
        try {
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('profile-name').innerText = data.name || "Usuário";
                document.getElementById('profile-role').innerText = data.role || "Colaborador";
                const img = document.getElementById('user-avatar-img'), ph = document.getElementById('user-avatar-placeholder');
                if(data.photoUrl){ img.src=data.photoUrl; img.style.display='block'; ph.style.display='none'; }
                else { img.style.display='none'; ph.style.display='flex'; }
            } else {
                document.getElementById('profile-name').innerText = "Novo Usuário";
                document.getElementById('profile-role').innerText = "Pendente...";
                await Swal.fire({ icon:'info', title:'Bem-vindo!', text:'Complete seu perfil.', confirmButtonText:'Ok' });
                app.openProfileEditor();
            }
        } catch(e){}
    },

    openProfileEditor: async () => {
        const uid = auth.currentUser.uid;
        let d = {name:'', role:'', phone:'', photoUrl:''};
        try { const s = await getDoc(doc(db,"users",uid)); if(s.exists()) d=s.data(); } catch(e){}
        const {value:v} = await Swal.fire({
            title:'Editar Perfil', html:
            `<input id="sw-n" class="swal2-input" placeholder="Nome" value="${d.name||''}"><input id="sw-r" class="swal2-input" placeholder="Cargo" value="${d.role||''}"><input id="sw-p" class="swal2-input" placeholder="Foto URL" value="${d.photoUrl||''}">`,
            preConfirm:()=>{ return {name:document.getElementById('sw-n').value, role:document.getElementById('sw-r').value, photoUrl:document.getElementById('sw-p').value} }
        });
        if(v) { await setDoc(doc(db,"users",uid),v,{merge:true}); Toast.fire({icon:'success',title:'Perfil salvo'}); app.loadUserProfile(uid); }
    },

    switchTab: (tabId) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
        const btnIndex = tabId === 'tab-lancamento' ? 0 : 1;
        document.querySelectorAll('nav button')[btnIndex].classList.add('active');
        document.getElementById(tabId).classList.add('active');
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
        if (!p || !s || !d || ef <= 0) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha tudo.' });
        try {
            await addDoc(collection(db, "registros_absenteismo"), {
                planta: p, turno: t, setor: s, data_registro: d, timestamp: Timestamp.now(),
                efetivo: ef, faltas: fa, absenteismo_percentual: parseFloat(((fa/ef)*100).toFixed(2)),
                usuario_id: auth.currentUser.uid
            });
            await setDoc(doc(db, "config_efetivo", `${p}_${t}_${s}`), { efetivo_atual: ef, ultima_atualizacao: Timestamp.now() }, { merge: true });
            Toast.fire({ icon: 'success', title: 'Salvo!' });
            document.getElementById('inp-faltas').value = '';
        } catch (e) { Swal.fire({ icon: 'error', title: 'Erro', text: 'Erro ao salvar.' }); }
    },

    deleteItem: async (id) => { 
        Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sim' }).then(async (r) => {
            if (r.isConfirmed) { await deleteDoc(doc(db, "registros_absenteismo", id)); Toast.fire({ icon: 'success', title: 'Excluído.' }); }
        });
    },

    updateDashboard: async () => {
        const start = document.getElementById('dash-start').value, end = document.getElementById('dash-end').value;
        if (!start || !end) return;
        const q = query(collection(db, "registros_absenteismo"), where("data_registro", ">=", start), where("data_registro", "<=", end), orderBy("data_registro", "asc"));
        processChartData(await getDocs(q), start, end);
    }
};

function isValid(val) { const n = Number(val); return !isNaN(n) && n > 0; }
function createRecord(planta, setor, turno, data, efRaw, faRaw) {
    const ef = Number(efRaw), fa = Number(faRaw || 0);
    return { planta, setor, turno, data_registro: data, efetivo: ef, faltas: fa, absenteismo_percentual: parseFloat(((fa / ef) * 100).toFixed(2)), timestamp: Timestamp.now(), usuario_id: auth.currentUser.uid, origem: 'excel' };
}

function processChartData(snapshot, startDate, endDate) {
    let global = { ef: 0, fa: 0 };
    let plants = { "PLANTA 3": { ef:0, fa:0 }, "PLANTA 4": { ef:0, fa:0 } };
    let sectorStats = {}; 
    let sectorTotals = {}; 
    snapshot.forEach(doc => {
        const d = doc.data();
        global.ef += d.efetivo; global.fa += d.faltas;
        if(plants[d.planta]) { plants[d.planta].ef += d.efetivo; plants[d.planta].fa += d.faltas; }
        if(!sectorStats[d.setor]) sectorStats[d.setor] = { "1º TURNO": {ef:0, fa:0}, "2º TURNO": {ef:0, fa:0} };
        if(sectorStats[d.setor][d.turno]) { sectorStats[d.setor][d.turno].ef += d.efetivo; sectorStats[d.setor][d.turno].fa += d.faltas; }
        if(!sectorTotals[d.setor]) sectorTotals[d.setor] = { ef: 0, fa: 0 };
        sectorTotals[d.setor].ef += d.efetivo; sectorTotals[d.setor].fa += d.faltas;
    });
    const daysCount = (new Set(snapshot.docs.map(d=>d.data().data_registro))).size || 1;
    const calc = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) : "0.00";
    const mean = (f) => (f / daysCount).toFixed(1);

    document.getElementById('kpi-p3').innerText = calc(plants["PLANTA 3"].fa, plants["PLANTA 3"].ef) + "%";
    document.getElementById('mean-p3').innerHTML = `<i class="ph-bold ph-trend-up"></i> Média: ` + mean(plants["PLANTA 3"].fa);
    document.getElementById('kpi-p4').innerText = calc(plants["PLANTA 4"].fa, plants["PLANTA 4"].ef) + "%";
    document.getElementById('mean-p4').innerHTML = `<i class="ph-bold ph-trend-up"></i> Média: ` + mean(plants["PLANTA 4"].fa);
    const globPct = calc(global.fa, global.ef);
    const elG = document.getElementById('kpi-global'); elG.innerText = globPct + "%"; elG.className = `val ${parseFloat(globPct)>5?'alert-text':''}`;
    document.getElementById('mean-global').innerHTML = `<i class="ph-bold ph-globe"></i> Média: ` + mean(global.fa);

    renderDetailedCards(sectorStats, daysCount);
    renderConsolidatedCards(sectorTotals, daysCount);
    renderEvolutionChart(sectorTotals, startDate, endDate);
}

function renderDetailedCards(sectorStats, daysCount) {
    const g1 = document.getElementById('grid-t1'), g2 = document.getElementById('grid-t2');
    g1.innerHTML = ''; g2.innerHTML = '';
    Object.keys(sectorStats).sort().forEach(s => {
        const t1 = sectorStats[s]["1º TURNO"], t2 = sectorStats[s]["2º TURNO"];
        const p1 = t1.ef>0?((t1.fa/t1.ef)*100).toFixed(2):"0.00", p2 = t2.ef>0?((t2.fa/t2.ef)*100).toFixed(2):"0.00";
        g1.innerHTML += `<div class="mini-card border-t1"><h4>${s}</h4><div class="val ${parseFloat(p1)>5?'alert-text':''}">${p1}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Média: ${(t1.fa/daysCount).toFixed(1)}</span></div>`;
        g2.innerHTML += `<div class="mini-card border-t2"><h4>${s}</h4><div class="val ${parseFloat(p2)>5?'alert-text':''}">${p2}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Média: ${(t2.fa/daysCount).toFixed(1)}</span></div>`;
    });
}

function renderConsolidatedCards(sectorTotals, daysCount) {
    const g = document.getElementById('grid-consolidado'); g.innerHTML = '';
    Object.keys(sectorTotals).sort().forEach(s => {
        const t = sectorTotals[s], p = t.ef>0?((t.fa/t.ef)*100).toFixed(2):"0.00";
        g.innerHTML += `<div class="mini-card border-sector"><h4>Total ${s}</h4><div class="val ${parseFloat(p)>5?'alert-text':''}">${p}%</div><span class="sub-val"><i class="ph-bold ph-sigma"></i> Média Dia: ${(t.fa/daysCount).toFixed(1)}</span></div>`;
    });
}

function renderEvolutionChart(sectorTotals, start, end) {
    const ctx = document.getElementById('chart-evolution');
    if (chartEvolution) chartEvolution.destroy();
    const secs = Object.keys(sectorTotals).sort();
    const vals = secs.map(s => { const t = sectorTotals[s]; return t.ef>0?parseFloat(((t.fa/t.ef)*100).toFixed(2)):0; });
    const cols = secs.map(s => `hsl(${s.split('').reduce((a,b)=>a+b.charCodeAt(0),0)%360}, 70%, 50%)`);
    const fmt = d => d?d.split('-').reverse().join('/'):'...';
    chartEvolution = new Chart(ctx, {
        type: 'bar', data: { labels: secs, datasets: [{ label: 'Absenteísmo Acumulado', data: vals, backgroundColor: cols, barPercentage: 0.6, borderRadius:6 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid:{color:'#f1f5f9'} }, x:{grid:{display:false}} },
        plugins: { legend:{display:false}, title:{display:true, text:'Absenteísmo Acumulado por Setor', font:{size:16, family:"'Inter'", weight:600}, color:'#334155'}, subtitle:{display:true, text:`Período: ${fmt(start)} até ${fmt(end)}`, position:'bottom', padding:{top:10}}, datalabels:{color:'#334155', anchor:'end', align:'top', offset:-4, font:{weight:'bold'}, formatter: v => v>0?v+'%':''} } }
    });
}

onAuthStateChanged(auth, u => {
    document.getElementById('auth-overlay').style.display = u ? 'none' : 'flex';
    document.getElementById('app-container').style.display = u ? 'flex' : 'none';
    if(u) {
        app.loadUserProfile(u.uid);
        onSnapshot(query(collection(db, "registros_absenteismo"), orderBy("data_registro", "desc")), snap => {
            const p3 = document.querySelector('#table-p3 tbody'), p4 = document.querySelector('#table-p4 tbody');
            let h3_1='', h3_2='', h4_1='', h4_2='', t3={e:0,f:0}, t4={e:0,f:0};
            snap.forEach(doc => {
                const d = doc.data(), id = doc.id;
                const row = `<tr><td>${d.data_registro.split('-').reverse().join('/')}</td><td>${d.setor} <small style="color:#64748b">(${d.turno})</small></td><td>${d.efetivo}</td><td>${d.faltas}</td><td class="${d.absenteismo_percentual>5?'status-bad':''}">${d.absenteismo_percentual.toFixed(2)}%</td><td><button class="btn-logout" style="color:#ef4444; font-size:1rem;" onclick="app.deleteItem('${id}')"><i class="ph-bold ph-trash"></i></button></td></tr>`;
                if(d.planta==="PLANTA 3") { t3.e+=d.efetivo; t3.f+=d.faltas; if(d.turno==="1º TURNO") h3_1+=row; else h3_2+=row; } else { t4.e+=d.efetivo; t4.f+=d.faltas; if(d.turno==="1º TURNO") h4_1+=row; else h4_2+=row; }
            });
            const tot = t => t.e>0 ? `<tr class="total-row"><td colspan="2">TOTAL</td><td>${t.e}</td><td>${t.f}</td><td class="${(t.f/t.e*100)>5?'status-bad':''}">${(t.f/t.e*100).toFixed(2)}%</td><td>-</td></tr>` : '';
            p3.innerHTML = (h3_1?`<tr class="turn-header"><td colspan="6">1º Turno</td></tr>`+h3_1:'') + (h3_2?`<tr class="turn-header"><td colspan="6">2º Turno</td></tr>`+h3_2:'') + tot(t3);
            p4.innerHTML = (h4_1?`<tr class="turn-header"><td colspan="6">1º Turno</td></tr>`+h4_1:'') + (h4_2?`<tr class="turn-header"><td colspan="6">2º Turno</td></tr>`+h4_2:'') + tot(t4);
        });
        const d = new Date(), y = d.getFullYear(), m = d.getMonth();
        document.getElementById('dash-start').value = new Date(y, m, 1).toISOString().split('T')[0];
        document.getElementById('dash-end').value = new Date(y, m+1, 0).toISOString().split('T')[0];
    }
});
