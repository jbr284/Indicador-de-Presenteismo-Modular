import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, Timestamp, where, getDocs, setDoc, getDoc, writeBatch, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
let reportChart = null; // Gráfico exclusivo para PDF
let editingId = null;
let secretCount = 0;
let secretTimer = null;

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

    secretDebug: () => {
        secretCount++; clearTimeout(secretTimer); secretTimer = setTimeout(() => { secretCount = 0; }, 1000);
        if (secretCount === 5) { app.wipeData(); secretCount = 0; }
    },

    wipeData: async () => {
        const { value: text } = await Swal.fire({
            title: 'ACESSO RESTRITO', text: "Para limpar TODA a base de dados, digite 'DELETAR' abaixo.", input: 'text', icon: 'warning', inputPlaceholder: 'DELETAR', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'CONFIRMAR LIMPEZA'
        });
        if (text === 'DELETAR') {
            Swal.fire({title: 'Apagando...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
            try {
                const q = query(collection(db, "registros_absenteismo")); const snapshot = await getDocs(q);
                if (snapshot.empty) return Swal.fire('Vazio', 'Não há registros.', 'info');
                let batch = writeBatch(db); let count = 0;
                for (const doc of snapshot.docs) { batch.delete(doc.ref); count++; if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); } }
                await batch.commit(); Swal.fire('Limpo!', `${count} registros apagados.`, 'success');
            } catch (err) { Swal.fire('Erro', 'Falha ao limpar.', 'error'); }
        } else if (text) { Swal.fire('Erro', 'Palavra incorreta.', 'error'); }
    },

    saveData: async () => {
        const p = document.getElementById('inp-planta').value; const t = document.getElementById('inp-turno').value; const s = document.getElementById('inp-setor').value; const d = document.getElementById('inp-data').value; const ef = Number(document.getElementById('inp-efetivo').value); const fa = Number(document.getElementById('inp-faltas').value);
        if (!p || !s || !d || ef <= 0) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha todos os campos.' });

        const parts = d.split('-'); const inputDate = new Date(parts[0], parts[1] - 1, parts[2]); const today = new Date(); today.setHours(0,0,0,0);
        if (inputDate > today) return Swal.fire({ icon: 'error', title: 'Data Futura Bloqueada', html: `Você selecionou <b>${d.split('-').reverse().join('/')}</b>.<br>Não é permitido lançar data futura.`, confirmButtonColor: '#d33' });

        try {
            const abs = parseFloat(((fa/ef)*100).toFixed(2));
            if (editingId) {
                await updateDoc(doc(db, "registros_absenteismo", editingId), { planta: p, turno: t, setor: s, data_registro: d, efetivo: ef, faltas: fa, absenteismo_percentual: abs, updated_at: Timestamp.now() });
                await setDoc(doc(db, "config_efetivo", `${p}_${t}_${s}`), { efetivo_atual: ef, ultima_atualizacao: Timestamp.now() }, { merge: true });
                Toast.fire({ icon: 'success', title: 'Atualizado!' }); app.cancelEdit(); return;
            }
            const q = query(collection(db, "registros_absenteismo"), where("data_registro", "==", d), where("planta", "==", p), where("turno", "==", t), where("setor", "==", s));
            const dupCheck = await getDocs(q);
            if (!dupCheck.empty) return Swal.fire({ icon: 'warning', title: 'Registro Duplicado!', html: `<p>Já existe registro para <b>${s}</b> em <b>${d.split('-').reverse().join('/')}</b>.</p><p>Use a edição na tabela.</p>`, confirmButtonText: 'Cancelar Registro', confirmButtonColor: '#d33', showCancelButton: false });

            await addDoc(collection(db, "registros_absenteismo"), { planta: p, turno: t, setor: s, data_registro: d, timestamp: Timestamp.now(), efetivo: ef, faltas: fa, absenteismo_percentual: abs, usuario_id: auth.currentUser.uid });
            await setDoc(doc(db, "config_efetivo", `${p}_${t}_${s}`), { efetivo_atual: ef, ultima_atualizacao: Timestamp.now() }, { merge: true });
            Toast.fire({ icon: 'success', title: 'Salvo!' }); document.getElementById('inp-faltas').value = '';
        } catch (e) { Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao salvar.' }); }
    },

    editItem: async (id) => {
        try {
            const docSnap = await getDoc(doc(db, "registros_absenteismo", id));
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            document.getElementById('inp-planta').value = data.planta; app.updateSectors(); document.getElementById('inp-setor').value = data.setor; document.getElementById('inp-turno').value = data.turno; document.getElementById('inp-data').value = data.data_registro; document.getElementById('inp-efetivo').value = data.efetivo; document.getElementById('inp-faltas').value = data.faltas;
            editingId = id; document.getElementById('btn-save-text').innerText = "Atualizar Registro"; document.getElementById('btn-cancel-edit').style.display = 'inline-block';
            document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' });
        } catch(e) { console.error(e); }
    },

    cancelEdit: () => { editingId = null; document.getElementById('btn-save-text').innerText = "Salvar Registro"; document.getElementById('btn-cancel-edit').style.display = 'none'; document.getElementById('inp-efetivo').value = ''; document.getElementById('inp-faltas').value = ''; },
    deleteItem: async (id) => { Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sim' }).then(async (r) => { if (r.isConfirmed) { await deleteDoc(doc(db, "registros_absenteismo", id)); Toast.fire({ icon: 'success', title: 'Excluído.' }); } }); },

    // --- PDF GENERATOR (HTML2PDF) ---
    generatePDF: async () => {
        const start = document.getElementById('dash-start').value;
        const end = document.getElementById('dash-end').value;
        if (!start || !end) return Swal.fire('Atenção', 'Selecione um período.', 'warning');

        Swal.fire({title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

        // 1. Busca os dados para o Relatório
        const q = query(collection(db, "registros_absenteismo"), where("data_registro", ">=", start), where("data_registro", "<=", end), orderBy("data_registro", "asc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) return Swal.fire('Vazio', 'Sem dados para o PDF.', 'info');

        // 2. Preenche o Template Invisível
        document.getElementById('rep-periodo').innerText = `${start.split('-').reverse().join('/')} a ${end.split('-').reverse().join('/')}`;
        document.getElementById('rep-emissao').innerText = new Date().toLocaleString('pt-BR');

        let global = { ef: 0, fa: 0 }, p3 = { ef:0, fa:0 }, p4 = { ef:0, fa:0 };
        let sectorTotals = {};
        let chartData = {};

        snapshot.forEach(doc => {
            const d = doc.data();
            global.ef += d.efetivo; global.fa += d.faltas;
            if(d.planta === "PLANTA 3") { p3.ef += d.efetivo; p3.fa += d.faltas; } else { p4.ef += d.efetivo; p4.fa += d.faltas; }
            
            const key = `${d.setor} (${d.turno})`;
            if(!sectorTotals[key]) sectorTotals[key] = { ef:0, fa:0, setor: d.setor, turno: d.turno };
            sectorTotals[key].ef += d.efetivo; sectorTotals[key].fa += d.faltas;
            
            // Dados para o Gráfico (Agrupado por setor)
            if(!chartData[d.setor]) chartData[d.setor] = { ef:0, fa:0 };
            chartData[d.setor].ef += d.efetivo; chartData[d.setor].fa += d.faltas;
        });

        // Preenche KPIs
        const calc = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) + "%" : "0.00%";
        document.getElementById('rep-kpi-global').innerText = calc(global.fa, global.ef);
        document.getElementById('rep-kpi-p3').innerText = calc(p3.fa, p3.ef);
        document.getElementById('rep-kpi-p4').innerText = calc(p4.fa, p4.ef);

        // Preenche Tabela
        const tbody = document.getElementById('rep-table-body');
        tbody.innerHTML = '';
        Object.keys(sectorTotals).sort().forEach(k => {
            const t = sectorTotals[k];
            tbody.innerHTML += `<tr><td>${t.setor}</td><td>${t.turno}</td><td>${(t.ef/snapshot.size).toFixed(0)}*</td><td>${t.fa}</td><td><strong>${calc(t.fa, t.ef)}</strong></td></tr>`;
        });

        // Gera Gráfico do Relatório
        const ctxRep = document.getElementById('rep-chart-canvas');
        if (reportChart) reportChart.destroy();

        const labels = Object.keys(chartData).sort();
        const values = labels.map(l => chartData[l].ef > 0 ? parseFloat(((chartData[l].fa/chartData[l].ef)*100).toFixed(2)) : 0);

        reportChart = new Chart(ctxRep, {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [{ label: '% Absenteísmo', data: values, backgroundColor: '#2563eb', borderColor: '#1e3a8a', borderWidth: 1 }] 
            },
            options: {
                animation: false, // Importante: Sem animação para renderizar rápido
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false }, datalabels: { color: 'black', anchor: 'end', align: 'top', font: { weight: 'bold' }, formatter: v => v+'%' } }
            }
        });

        // 3. Aguarda renderizar e chama html2pdf
        setTimeout(() => {
            const element = document.getElementById('report-template');
            
            // Configurações do PDF
            const opt = {
                margin: 5,
                filename: `Relatorio_Modular_${start}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 }, // Alta resolução
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            // Gera e baixa
            html2pdf().set(opt).from(element).save().then(() => {
                Swal.close();
                Toast.fire({ icon: 'success', title: 'PDF baixado!' });
            });

        }, 800); // Delay para o gráfico aparecer
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
            } else {
                document.getElementById('profile-name').innerText = "Novo Usuário"; document.getElementById('profile-role').innerText = "Pendente...";
                await Swal.fire({ icon:'info', title:'Bem-vindo!', text:'Complete seu perfil.', confirmButtonText:'Ok' }); app.openProfileEditor();
            }
        } catch(e){}
    },
    openProfileEditor: async () => {
        const uid = auth.currentUser.uid; let d = {name:'', role:'', phone:'', photoUrl:''}; try { const s = await getDoc(doc(db,"users",uid)); if(s.exists()) d=s.data(); } catch(e){}
        const {value:v} = await Swal.fire({ title:'Perfil', html:`<input id="sw-n" class="swal2-input" placeholder="Nome" value="${d.name||''}"><input id="sw-r" class="swal2-input" placeholder="Cargo" value="${d.role||''}"><input id="sw-p" class="swal2-input" placeholder="Foto URL" value="${d.photoUrl||''}">`, preConfirm:()=>{ return {name:document.getElementById('sw-n').value, role:document.getElementById('sw-r').value, photoUrl:document.getElementById('sw-p').value} }});
        if(v) { await setDoc(doc(db,"users",uid),v,{merge:true}); Toast.fire({icon:'success',title:'Salvo'}); app.loadUserProfile(uid); }
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
        const p = document.getElementById('inp-planta').value; const s = document.getElementById('inp-setor'); s.innerHTML = '<option value="">Selecione...</option>';
        if (estruturaSetores[p]) estruturaSetores[p].forEach(x => s.innerHTML += `<option value="${x}">${x}</option>`);
    },
    loadHeadcount: async () => {
        const p = document.getElementById('inp-planta').value, t = document.getElementById('inp-turno').value, s = document.getElementById('inp-setor').value; const inp = document.getElementById('inp-efetivo'); if (!p || !t || !s) return; inp.placeholder = "Buscando...";
        try { const snap = await getDoc(doc(db, "config_efetivo", `${p}_${t}_${s}`)); if (snap.exists()) inp.value = snap.data().efetivo_atual; else { inp.value = ""; inp.placeholder = "Digite..."; } } catch (e) {}
    },
    updateDashboard: async () => {
        const start = document.getElementById('dash-start').value, end = document.getElementById('dash-end').value; if (!start || !end) return;
        const q = query(collection(db, "registros_absenteismo"), where("data_registro", ">=", start), where("data_registro", "<=", end), orderBy("data_registro", "asc"));
        processChartData(await getDocs(q), start, end);
    }
};

function processChartData(snapshot, startDate, endDate) {
    let global = { ef: 0, fa: 0 }; let plants = { "PLANTA 3": { ef:0, fa:0 }, "PLANTA 4": { ef:0, fa:0 } }; let sectorStats = {}; let sectorTotals = {};
    snapshot.forEach(doc => { const d = doc.data(); global.ef += d.efetivo; global.fa += d.faltas; if(plants[d.planta]) { plants[d.planta].ef += d.efetivo; plants[d.planta].fa += d.faltas; } if(!sectorStats[d.setor]) sectorStats[d.setor] = { "1º TURNO": {ef:0, fa:0}, "2º TURNO": {ef:0, fa:0} }; if(sectorStats[d.setor][d.turno]) { sectorStats[d.setor][d.turno].ef += d.efetivo; sectorStats[d.setor][d.turno].fa += d.faltas; } if(!sectorTotals[d.setor]) sectorTotals[d.setor] = { ef: 0, fa: 0 }; sectorTotals[d.setor].ef += d.efetivo; sectorTotals[d.setor].fa += d.faltas; });
    const daysCount = (new Set(snapshot.docs.map(d=>d.data().data_registro))).size || 1; const calc = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) : "0.00"; const mean = (f) => (f / daysCount).toFixed(1);
    document.getElementById('kpi-p3').innerText = calc(plants["PLANTA 3"].fa, plants["PLANTA 3"].ef) + "%"; document.getElementById('mean-p3').innerHTML = `<i class="ph-bold ph-trend-up"></i> Média: ` + mean(plants["PLANTA 3"].fa);
    document.getElementById('kpi-p4').innerText = calc(plants["PLANTA 4"].fa, plants["PLANTA 4"].ef) + "%"; document.getElementById('mean-p4').innerHTML = `<i class="ph-bold ph-trend-up"></i> Média: ` + mean(plants["PLANTA 4"].fa);
    const globPct = calc(global.fa, global.ef); const elG = document.getElementById('kpi-global'); elG.innerText = globPct + "%"; elG.className = `val ${parseFloat(globPct)>5?'alert-text':''}`; document.getElementById('mean-global').innerHTML = `<i class="ph-bold ph-globe"></i> Média: ` + mean(global.fa);
    renderDetailedCards(sectorStats, daysCount); renderConsolidatedCards(sectorTotals, daysCount); renderEvolutionChart(sectorTotals, startDate, endDate);
}
function renderDetailedCards(s, d) { const g1 = document.getElementById('grid-t1'), g2 = document.getElementById('grid-t2'); g1.innerHTML=''; g2.innerHTML=''; Object.keys(s).sort().forEach(k => { const t1=s[k]["1º TURNO"], t2=s[k]["2º TURNO"], p1=t1.ef>0?((t1.fa/t1.ef)*100).toFixed(2):"0.00", p2=t2.ef>0?((t2.fa/t2.ef)*100).toFixed(2):"0.00"; g1.innerHTML+=`<div class="mini-card border-t1"><h4>${k}</h4><div class="val ${parseFloat(p1)>5?'alert-text':''}">${p1}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Média: ${(t1.fa/d).toFixed(1)}</span></div>`; g2.innerHTML+=`<div class="mini-card border-t2"><h4>${k}</h4><div class="val ${parseFloat(p2)>5?'alert-text':''}">${p2}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Média: ${(t2.fa/d).toFixed(1)}</span></div>`; }); }
function renderConsolidatedCards(s, d) { const g = document.getElementById('grid-consolidado'); g.innerHTML=''; Object.keys(s).sort().forEach(k => { const t=s[k], p=t.ef>0?((t.fa/t.ef)*100).toFixed(2):"0.00"; g.innerHTML+=`<div class="mini-card border-sector"><h4>Total ${k}</h4><div class="val ${parseFloat(p)>5?'alert-text':''}">${p}%</div><span class="sub-val"><i class="ph-bold ph-sigma"></i> Média Dia: ${(t.fa/d).toFixed(1)}</span></div>`; }); }
function renderEvolutionChart(s, st, en) { const ctx = document.getElementById('chart-evolution'); if (chartEvolution) chartEvolution.destroy(); const keys = Object.keys(s).sort(), vals = keys.map(k => s[k].ef>0?parseFloat(((s[k].fa/s[k].ef)*100).toFixed(2)):0), cols = keys.map(k => `hsl(${k.split('').reduce((a,b)=>a+b.charCodeAt(0),0)%360}, 70%, 50%)`); chartEvolution = new Chart(ctx, { type: 'bar', data: { labels: keys, datasets: [{ label: 'Absenteísmo Acumulado', data: vals, backgroundColor: cols, barPercentage: 0.6, borderRadius:6 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid:{color:'#f1f5f9'} }, x:{grid:{display:false}} }, plugins: { legend:{display:false}, title:{display:true, text:'Absenteísmo Acumulado por Setor', font:{size:16, family:"'Inter'", weight:600}, color:'#334155'}, datalabels:{color:'#334155', anchor:'end', align:'top', offset:-4, font:{weight:'bold'}, formatter: v => v>0?v+'%':''} } } }); }

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
                const actions = `<div style="display:flex; gap:5px;"><button class="btn-edit" style="border:none; padding:5px 8px; border-radius:4px; cursor:pointer;" onclick="app.editItem('${id}')" title="Editar"><i class="ph-bold ph-pencil-simple"></i></button><button class="btn-logout" style="color:#ef4444; font-size:1rem; padding:5px 8px;" onclick="app.deleteItem('${id}')" title="Excluir"><i class="ph-bold ph-trash"></i></button></div>`;
                const row = `<tr><td>${d.data_registro.split('-').reverse().join('/')}</td><td>${d.setor} <small style="color:#64748b">(${d.turno})</small></td><td>${d.efetivo}</td><td>${d.faltas}</td><td class="${d.absenteismo_percentual>5?'status-bad':''}">${d.absenteismo_percentual.toFixed(2)}%</td><td>${actions}</td></tr>`;
                if(d.planta==="PLANTA 3") { t3.e+=d.efetivo; t3.f+=d.faltas; if(d.turno==="1º TURNO") h3_1+=row; else h3_2+=row; } else { t4.e+=d.efetivo; t4.f+=d.faltas; if(d.turno==="1º TURNO") h4_1+=row; else h4_2+=row; }
            });
            const tot = t => t.e>0 ? `<tr class="total-row"><td colspan="2">TOTAL</td><td>${t.e}</td><td>${t.f}</td><td class="${(t.f/t.e*100)>5?'status-bad':''}">${(t.f/t.e*100).toFixed(2)}%</td><td>-</td></tr>` : '';
            p3.innerHTML = (h3_1?`<tr class="turn-header"><td colspan="6">1º Turno</td></tr>`+h3_1:'') + (h3_2?`<tr class="turn-header"><td colspan="6">2º Turno</td></tr>`+h3_2:'') + tot(t3);
            p4.innerHTML = (h4_1?`<tr class="turn-header"><td colspan="6">1º Turno</td></tr>`+h4_1:'') + (h4_2?`<tr class="turn-header"><td colspan="6">2º Turno</td></tr>`+h4_2:'') + tot(t4);
        });
        
        document.getElementById('dash-start').value = "2026-01-01";
        const today = new Date();
        const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('dash-end').value = localToday;
    }
});
