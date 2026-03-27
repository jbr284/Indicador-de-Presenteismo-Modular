import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, onSnapshot, deleteDoc, doc, Timestamp, setDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
let marcosGlobais = []; 
let baseDadosCache = []; // Cache para a nova aba Base de Dados

Chart.register(ChartDataLabels);

const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true,
    didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
});

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

    saveData: async () => {
        const d = document.getElementById('inp-data').value;
        if (!d) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Selecione a data de vigência.' });

        let marcoAnterior = marcosGlobais.find(m => m.id <= d) || {};

        const getValor = (idHtml, chaveBanco) => {
            const valorDigitado = document.getElementById(idHtml).value.trim();
            if (valorDigitado !== "") return parseInt(valorDigitado) || 0; 
            return marcoAnterior[chaveBanco] || 0; 
        };

        const f1 = getValor('ef-fab-1', 'fab_1');
        const f2 = getValor('ef-fab-2', 'fab_2');
        const e1 = getValor('ef-est-1', 'est_1');
        const e2 = getValor('ef-est-2', 'est_2');
        const m1 = getValor('ef-mont-1', 'mont_1');
        const m2 = getValor('ef-mont-2', 'mont_2');
        const p1 = getValor('ef-pain-1', 'pain_1');
        const p2 = getValor('ef-pain-2', 'pain_2');

        if (f1+f2+e1+e2+m1+m2+p1+p2 === 0) {
            return Swal.fire({ icon: 'error', title: 'Fábrica Vazia?', text: 'O efetivo total não pode ser zero.' });
        }

        try {
            await setDoc(doc(db, "efetivos_vigencia", d), {
                fab_1: f1, fab_2: f2, est_1: e1, est_2: e2,
                mont_1: m1, mont_2: m2, pain_1: p1, pain_2: p2,
                updated_at: Timestamp.now(), usuario_id: auth.currentUser.uid
            });
            Toast.fire({ icon: 'success', title: 'Efetivo Global Salvo com Herança!' });
            
            ['ef-fab-1','ef-fab-2','ef-est-1','ef-est-2','ef-mont-1','ef-mont-2','ef-pain-1','ef-pain-2'].forEach(id => document.getElementById(id).value = '');
        } catch (e) { 
            console.error(e); 
            Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao salvar no banco.' }); 
        }
    },

    editMarco: async (id) => {
        const marco = marcosGlobais.find(m => m.id === id);
        if (!marco) return;
        
        const dataFormatada = id.split('-').reverse().join('/');

        const { value: formValues } = await Swal.fire({
            title: 'Editar Efetivo',
            html: `
                <div style="text-align: left; margin-bottom: 15px; font-weight: bold; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                    <i class="ph-bold ph-calendar-blank"></i> Vigência: ${dataFormatada}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left; font-size: 0.9rem;">
                    <div><label style="color:#64748b; font-weight:600;">Fab 1ºT</label><input id="sw-f1" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.fab_1 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Fab 2ºT</label><input id="sw-f2" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.fab_2 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Est 1ºT</label><input id="sw-e1" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.est_1 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Est 2ºT</label><input id="sw-e2" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.est_2 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Mont 1ºT</label><input id="sw-m1" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.mont_1 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Mont 2ºT</label><input id="sw-m2" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.mont_2 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Painel 1ºT</label><input id="sw-p1" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.pain_1 || 0}"></div>
                    <div><label style="color:#64748b; font-weight:600;">Painel 2ºT</label><input id="sw-p2" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0 0;" value="${marco.pain_2 || 0}"></div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '<i class="ph-bold ph-floppy-disk"></i> Salvar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#2563eb',
            preConfirm: () => {
                return {
                    fab_1: parseInt(document.getElementById('sw-f1').value) || 0,
                    fab_2: parseInt(document.getElementById('sw-f2').value) || 0,
                    est_1: parseInt(document.getElementById('sw-e1').value) || 0,
                    est_2: parseInt(document.getElementById('sw-e2').value) || 0,
                    mont_1: parseInt(document.getElementById('sw-m1').value) || 0,
                    mont_2: parseInt(document.getElementById('sw-m2').value) || 0,
                    pain_1: parseInt(document.getElementById('sw-p1').value) || 0,
                    pain_2: parseInt(document.getElementById('sw-p2').value) || 0,
                }
            }
        });

        if (formValues) {
            try {
                await setDoc(doc(db, "efetivos_vigencia", id), {
                    ...formValues,
                    updated_at: Timestamp.now(),
                    usuario_id: auth.currentUser.uid
                }, { merge: true });
                Toast.fire({ icon: 'success', title: 'Efetivo atualizado com sucesso!' });
                
                if(document.getElementById('tab-indicadores').classList.contains('active')) {
                    app.updateDashboard();
                }
            } catch (e) {
                console.error(e);
                Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao atualizar no banco de dados.' });
            }
        }
    },

    deleteMarco: async (id) => { 
        Swal.fire({ title: 'Excluir Marco de Vigência?', text: 'Os indicadores voltarão a usar o marco anterior a este.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sim, excluir' }).then(async (r) => {
            if (r.isConfirmed) { await deleteDoc(doc(db, "efetivos_vigencia", id)); Toast.fire({ icon: 'success', title: 'Excluído.' }); }
        });
    },

    switchTab: (tabId) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
        
        let btnIndex = 0;
        if (tabId === 'tab-indicadores') btnIndex = 1;
        else if (tabId === 'tab-basedados') btnIndex = 2;
        
        document.querySelectorAll('nav button')[btnIndex].classList.add('active');
        document.getElementById(tabId).classList.add('active');
        
        if (tabId === 'tab-indicadores') app.updateDashboard();
        if (tabId === 'tab-basedados') app.loadBaseDados(); // Gatilho para carregar a 3ª Aba
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

    updateDashboard: async () => {
        const start = document.getElementById('dash-start').value;
        const end = document.getElementById('dash-end').value;
        if (!start || !end) return;

        if (marcosGlobais.length === 0) return Swal.fire('Sem Efetivo', 'Cadastre o primeiro Marco de Efetivo na outra aba.', 'info');

        Swal.fire({ title: 'Cruzando Dados...', text: 'Buscando faltas...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let cacheSemanas = {}; 
        let stats = {
            global: { ef: 0, fa: 0 },
            plantas: { "PLANTA 3": { ef: 0, fa: 0 }, "PLANTA 4": { ef: 0, fa: 0 } },
            setores: {
                "Fabricação": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } },
                "Mont. Estrutural": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } },
                "Montagem final": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } },
                "Painéis": { "1º TURNO": { ef: 0, fa: 0 }, "2º TURNO": { ef: 0, fa: 0 } }
            }
        };

        let currentDate = new Date(start + "T12:00:00");
        let endDateObj = new Date(end + "T12:00:00");
        let diasUteisProcessados = 0;

        while (currentDate <= endDateObj) {
            let dayOfWeek = currentDate.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) { 
                let dateStr = currentDate.toISOString().split('T')[0];
                let weekId = getWeekId(currentDate);
                let dayIndex = dayOfWeek - 1;
                let marcoAtivo = marcosGlobais.find(m => m.id <= dateStr);
                
                if (marcoAtivo) {
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
        if(diasUteisProcessados === 0) Toast.fire({ icon: 'info', title: 'Nenhum lançamento no período.' });
        renderDashboardUI(stats, diasUteisProcessados || 1);
    },

    exportarExcelMestre: async () => {
        const start = document.getElementById('dash-start').value;
        const end = document.getElementById('dash-end').value;
        
        if (!start || !end) return Swal.fire('Atenção', 'Selecione as datas inicial e final.', 'warning');
        if (marcosGlobais.length === 0) return Swal.fire('Atenção', 'Nenhum Efetivo cadastrado.', 'warning');

        Swal.fire({ title: 'Gerando Relatório...', text: 'Construindo abas de detalhes...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let cacheSemanas = {};
        let dailyDataP3 = []; 
        let dailyDataP4 = []; 

        let currentDate = new Date(start + "T12:00:00");
        let endDateObj = new Date(end + "T12:00:00");

        while (currentDate <= endDateObj) {
            let dayOfWeek = currentDate.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                let dateStr = currentDate.toISOString().split('T')[0];
                let weekId = getWeekId(currentDate);
                let dayIndex = dayOfWeek - 1;
                let marco = marcosGlobais.find(m => m.id <= dateStr);

                if (marco) {
                    if (cacheSemanas[weekId] === undefined) {
                        try {
                            let docSnap = await getDoc(doc(db, "contador_de_presenca", weekId));
                            cacheSemanas[weekId] = docSnap.exists() ? docSnap.data().dados : null;
                        } catch(e) { cacheSemanas[weekId] = null; }
                    }

                    let semanaApp1 = cacheSemanas[weekId];
                    if (semanaApp1) {
                        const extrairFaltas = (area, turno) => {
                            let l = semanaApp1.find(x => x.area === area && x.turno === turno);
                            if(!l) return 0;
                            let f = l.dias[dayIndex];
                            return (f === "" || isNaN(f)) ? 0 : parseInt(f);
                        };

                        dailyDataP3.push({
                            data: dateStr.split('-').reverse().join('/'),
                            fab1_ef: marco.fab_1 || 0, fab1_fa: extrairFaltas('Fabricação', '1º'),
                            fab2_ef: marco.fab_2 || 0, fab2_fa: extrairFaltas('Fabricação', '2º'),
                            est1_ef: marco.est_1 || 0, est1_fa: extrairFaltas('Estrutural', '1º'),
                            est2_ef: marco.est_2 || 0, est2_fa: extrairFaltas('Estrutural', '2º')
                        });

                        dailyDataP4.push({
                            data: dateStr.split('-').reverse().join('/'),
                            mont1_ef: marco.mont_1 || 0, mont1_fa: extrairFaltas('Mont. Final', '1º'),
                            mont2_ef: marco.mont_2 || 0, mont2_fa: extrairFaltas('Mont. Final', '2º'),
                            pain1_ef: marco.pain_1 || 0, pain1_fa: extrairFaltas('Painéis', '1º'),
                            pain2_ef: marco.pain_2 || 0, pain2_fa: extrairFaltas('Painéis', '2º')
                        });
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if(dailyDataP3.length === 0) return Swal.fire('Aviso', 'Nenhum dado encontrado no App 1 para este período.', 'info');

        try {
            const workbook = new ExcelJS.Workbook();
            const corRoxaBase = 'FF7030A0'; 
            
            const aplicarEstilosGlobais = (worksheet, totalRows) => {
                for (let r = 1; r <= totalRows; r++) {
                    let row = worksheet.getRow(r);
                    for (let c = 1; c <= 13; c++) {
                        let cell = row.getCell(c);
                        cell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        if (r <= 3) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corRoxaBase } };
                            let fontSize = 14; 
                            if (r === 1) fontSize = 22;
                            if (r === 2) fontSize = 18;
                            cell.font = { name: 'Arial', size: fontSize, bold: true, color: { argb: 'FFFFFFFF' } };
                        } else {
                            row.height = 25;
                            cell.font = { name: 'Arial', size: 12 };
                        }
                    }
                }
                worksheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
            };

            const addConditionalFormatting = (worksheet, ref) => {
                worksheet.addConditionalFormatting({
                    ref: ref,
                    rules: [{
                        type: 'cellIs', operator: 'greaterThan', formulae: [0.05],
                        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFF0000' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true } }
                    }]
                });
            };

            // ABA: PLANTA 3
            const wsP3 = workbook.addWorksheet('Planta 3');
            wsP3.columns = [
                { key: 'data', width: 16 },
                { key: 'f1e', width: 16 }, { key: 'f1f', width: 16 }, { key: 'f1a', width: 18 },
                { key: 'f2e', width: 16 }, { key: 'f2f', width: 16 }, { key: 'f2a', width: 18 },
                { key: 'e1e', width: 16 }, { key: 'e1f', width: 16 }, { key: 'e1a', width: 18 },
                { key: 'e2e', width: 16 }, { key: 'e2f', width: 16 }, { key: 'e2a', width: 18 }
            ];

            const r1_3 = wsP3.getRow(1);
            r1_3.height = 40;
            r1_3.getCell(2).value = 'FABRICAÇÃO';
            r1_3.getCell(8).value = 'MONTAGEM ESTRUTURAL';
            wsP3.mergeCells('B1:G1'); wsP3.mergeCells('H1:M1');

            const r2_3 = wsP3.getRow(2);
            r2_3.height = 30;
            r2_3.getCell(2).value = '1º TURNO'; r2_3.getCell(5).value = '2º TURNO';
            r2_3.getCell(8).value = '1º TURNO'; r2_3.getCell(11).value = '2º TURNO';
            wsP3.mergeCells('B2:D2'); wsP3.mergeCells('E2:G2'); wsP3.mergeCells('H2:J2'); wsP3.mergeCells('K2:M2');

            const r3_3 = wsP3.getRow(3);
            r3_3.height = 25;
            r3_3.getCell(1).value = 'Data';
            wsP3.mergeCells('A1:A3');
            const titulosL3 = ['EFETIVO', 'FALTAS', 'ABSENT.', 'EFETIVO', 'FALTAS', 'ABSENT.', 'EFETIVO', 'FALTAS', 'ABSENT.', 'EFETIVO', 'FALTAS', 'ABSENT.'];
            titulosL3.forEach((t, index) => r3_3.getCell(index + 2).value = t);

            dailyDataP3.forEach((d, i) => {
                let row = wsP3.addRow({ data: d.data, f1e: d.fab1_ef, f1f: d.fab1_fa, f2e: d.fab2_ef, f2f: d.fab2_fa, e1e: d.est1_ef, e1f: d.est1_fa, e2e: d.est2_ef, e2f: d.est2_fa });
                let rIdx = i + 4; 
                row.getCell('D').value = { formula: `IF(B${rIdx}>0, C${rIdx}/B${rIdx}, 0)` };
                row.getCell('G').value = { formula: `IF(E${rIdx}>0, F${rIdx}/E${rIdx}, 0)` };
                row.getCell('J').value = { formula: `IF(H${rIdx}>0, I${rIdx}/H${rIdx}, 0)` };
                row.getCell('M').value = { formula: `IF(K${rIdx}>0, L${rIdx}/K${rIdx}, 0)` };
                ['D', 'G', 'J', 'M'].forEach(col => row.getCell(col).numFmt = '0.00%');
            });

            let lastRowP3 = dailyDataP3.length + 3;
            aplicarEstilosGlobais(wsP3, lastRowP3);
            addConditionalFormatting(wsP3, `D4:D${lastRowP3}`); addConditionalFormatting(wsP3, `G4:G${lastRowP3}`);
            addConditionalFormatting(wsP3, `J4:J${lastRowP3}`); addConditionalFormatting(wsP3, `M4:M${lastRowP3}`);

            // ABA: PLANTA 4
            const wsP4 = workbook.addWorksheet('Planta 4');
            wsP4.columns = [
                { key: 'data', width: 16 },
                { key: 'm1e', width: 16 }, { key: 'm1f', width: 16 }, { key: 'm1a', width: 18 },
                { key: 'm2e', width: 16 }, { key: 'm2f', width: 16 }, { key: 'm2a', width: 18 },
                { key: 'p1e', width: 16 }, { key: 'p1f', width: 16 }, { key: 'p1a', width: 18 },
                { key: 'p2e', width: 16 }, { key: 'p2f', width: 16 }, { key: 'p2a', width: 18 }
            ];

            const r1_4 = wsP4.getRow(1);
            r1_4.height = 40;
            r1_4.getCell(2).value = 'MONTAGEM FINAL';
            r1_4.getCell(8).value = 'PAINÉIS';
            wsP4.mergeCells('B1:G1'); wsP4.mergeCells('H1:M1');

            const r2_4 = wsP4.getRow(2);
            r2_4.height = 30;
            r2_4.getCell(2).value = '1º TURNO'; r2_4.getCell(5).value = '2º TURNO';
            r2_4.getCell(8).value = '1º TURNO'; r2_4.getCell(11).value = '2º TURNO';
            wsP4.mergeCells('B2:D2'); wsP4.mergeCells('E2:G2'); wsP4.mergeCells('H2:J2'); wsP4.mergeCells('K2:M2');

            const r3_4 = wsP4.getRow(3);
            r3_4.height = 25;
            r3_4.getCell(1).value = 'Data';
            wsP4.mergeCells('A1:A3');
            titulosL3.forEach((t, index) => r3_4.getCell(index + 2).value = t);

            dailyDataP4.forEach((d, i) => {
                let row = wsP4.addRow({ data: d.data, m1e: d.mont1_ef, m1f: d.mont1_fa, m2e: d.mont2_ef, m2f: d.mont2_fa, p1e: d.pain1_ef, p1f: d.pain1_fa, p2e: d.pain2_ef, p2f: d.pain2_fa });
                let rIdx = i + 4;
                row.getCell('D').value = { formula: `IF(B${rIdx}>0, C${rIdx}/B${rIdx}, 0)` };
                row.getCell('G').value = { formula: `IF(E${rIdx}>0, F${rIdx}/E${rIdx}, 0)` };
                row.getCell('J').value = { formula: `IF(H${rIdx}>0, I${rIdx}/H${rIdx}, 0)` };
                row.getCell('M').value = { formula: `IF(K${rIdx}>0, L${rIdx}/K${rIdx}, 0)` };
                ['D', 'G', 'J', 'M'].forEach(col => row.getCell(col).numFmt = '0.00%');
            });

            let lastRowP4 = dailyDataP4.length + 3;
            aplicarEstilosGlobais(wsP4, lastRowP4);
            addConditionalFormatting(wsP4, `D4:D${lastRowP4}`); addConditionalFormatting(wsP4, `G4:G${lastRowP4}`);
            addConditionalFormatting(wsP4, `J4:J${lastRowP4}`); addConditionalFormatting(wsP4, `M4:M${lastRowP4}`);

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Relatorio_Modular_Absenteismo_${start}_a_${end}.xlsx`);

            Swal.close();
            Toast.fire({ icon: 'success', title: 'Relatório Exportado!' });

        } catch (err) {
            console.error("Erro ao gerar Excel:", err);
            Swal.fire('Erro', 'Ocorreu um problema ao montar o arquivo Excel.', 'error');
        }
    },

    // ========================================================
    // NOVA ABA: BASE DE DADOS (READ-ONLY)
    // ========================================================
    loadBaseDados: async () => {
        const container = document.getElementById('accordion-container-bd');
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: #64748b;"><i class="ph ph-spinner ph-spin" style="font-size: 2rem;"></i><br>Conectando ao App 1...</div>';
        
        try {
            const snap = await getDocs(collection(db, "contador_de_presenca"));
            baseDadosCache = [];
            snap.forEach(doc => {
                baseDadosCache.push({ id: doc.id, ...doc.data() });
            });
            
            // Ordena o histórico do mais recente para o mais antigo decifrando a string da semana
            baseDadosCache.sort((a, b) => {
                const getTimestamp = (str) => {
                    const partes = str.split(' ');
                    if (partes.length < 5) return 0;
                    const dia = parseInt(partes[0]);
                    const mesStr = partes[partes.length - 3].toLowerCase();
                    const ano = parseInt(partes[partes.length - 1]);
                    const meses = {'jan':0,'fev':1,'mar':2,'abr':3,'mai':4,'jun':5,'jul':6,'ago':7,'set':8,'out':9,'nov':10,'dez':11};
                    return new Date(ano, meses[mesStr.substring(0,3)] || 0, dia).getTime();
                };
                return getTimestamp(b.id) - getTimestamp(a.id);
            });

            app.renderBaseDados(baseDadosCache);
        } catch (e) {
            console.error(e);
            container.innerHTML = '<div style="color: var(--danger); text-align: center;">Erro ao carregar a base de dados.</div>';
        }
    },

    renderBaseDados: (lista) => {
        const container = document.getElementById('accordion-container-bd');
        if (lista.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Nenhum registro encontrado no App 1.</div>';
            return;
        }

        let html = '';
        lista.forEach((semana, index) => {
            const registros = semana.dados || [];
            const resT1 = semana.resumoT1 || "Sem observações registradas.";
            const resT2 = semana.resumoT2 || "Sem observações registradas.";

            // Monta as linhas da tabela
            let rows = '';
            let totSeg=0, totTer=0, totQua=0, totQui=0, totSex=0, totGeral=0;

            registros.forEach(r => {
                let d0 = parseInt(r.dias[0])||0; let d1 = parseInt(r.dias[1])||0;
                let d2 = parseInt(r.dias[2])||0; let d3 = parseInt(r.dias[3])||0;
                let d4 = parseInt(r.dias[4])||0;
                let totLinha = d0+d1+d2+d3+d4;

                totSeg+=d0; totTer+=d1; totQua+=d2; totQui+=d3; totSex+=d4; totGeral+=totLinha;

                rows += `<tr>
                    <td class="td-area-hist">${r.area}</td>
                    <td class="td-turno-hist">${r.turno}</td>
                    <td>${d0||'-'}</td><td>${d1||'-'}</td><td>${d2||'-'}</td><td>${d3||'-'}</td><td>${d4||'-'}</td>
                    <td class="td-total-hist">${totLinha}</td>
                </tr>`;
            });

            // Linha Final da Semana
            rows += `<tr class="row-total-hist">
                <td colspan="2" style="text-align: right;">FALTAS TOTAIS DA SEMANA:</td>
                <td>${totSeg}</td><td>${totTer}</td><td>${totQua}</td><td>${totQui}</td><td>${totSex}</td>
                <td>${totGeral}</td>
            </tr>`;

            html += `
            <div class="accordion-item bd-item" data-id="${semana.id.toLowerCase()}" style="margin-bottom: 15px;">
                <div class="accordion-header" onclick="toggleAccordion('bd-acc-${index}')">
                    <h3><i class="ph ph-calendar-blank"></i> Semana: ${semana.id}</h3>
                    <i class="ph-bold ph-caret-down acc-icon"></i>
                </div>
                <div class="accordion-content" id="bd-acc-${index}">
                    <div style="padding: 1.5rem;">
                        <div class="hist-table-wrapper">
                            <table class="hist-table">
                                <thead>
                                    <tr>
                                        <th style="width: 25%;">Área</th>
                                        <th style="width: 10%;">Turno</th>
                                        <th>Seg</th><th>Ter</th><th>Qua</th><th>Qui</th><th>Sex</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                            <div class="resumo-box"><h4><i class="ph-fill ph-chat-text"></i> Resumo 1º Turno (Supervisão)</h4><p>${resT1}</p></div>
                            <div class="resumo-box"><h4><i class="ph-fill ph-chat-text"></i> Resumo 2º Turno (Supervisão)</h4><p>${resT2}</p></div>
                        </div>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    },

    filtrarBaseDados: () => {
        const termo = document.getElementById('input-busca-bd').value.toLowerCase();
        const items = document.querySelectorAll('.bd-item');
        items.forEach(el => {
            const id = el.getAttribute('data-id');
            if (id.includes(termo)) el.style.display = 'block';
            else el.style.display = 'none';
        });
    }
};

function processarDiaUnico(semanaApp1, marco, dayIndex, stats, dateStr) {
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
            }
        }
    });
}

function renderDashboardUI(stats, daysCount) {
    const calc = (f, e) => e > 0 ? ((f/e)*100).toFixed(2) : "0.00"; 
    const mean = (f) => (f / daysCount).toFixed(1);

    document.getElementById('kpi-p3').innerText = calc(stats.plantas["PLANTA 3"].fa, stats.plantas["PLANTA 3"].ef) + "%"; 
    document.getElementById('mean-p3').innerHTML = `<i class="ph-bold ph-trend-up"></i> Faltas/dia: ` + mean(stats.plantas["PLANTA 3"].fa);
    
    document.getElementById('kpi-p4').innerText = calc(stats.plantas["PLANTA 4"].fa, stats.plantas["PLANTA 4"].ef) + "%"; 
    document.getElementById('mean-p4').innerHTML = `<i class="ph-bold ph-trend-up"></i> Faltas/dia: ` + mean(stats.plantas["PLANTA 4"].fa);
    
    const globPct = calc(stats.global.fa, stats.global.ef); 
    const elG = document.getElementById('kpi-global'); 
    elG.innerText = globPct + "%"; 
    elG.className = `val ${parseFloat(globPct)>5?'alert-text':''}`; 
    document.getElementById('mean-global').innerHTML = `<i class="ph-bold ph-globe"></i> Faltas/dia: ` + mean(stats.global.fa);

    const g1 = document.getElementById('grid-t1'), g2 = document.getElementById('grid-t2'), gc = document.getElementById('grid-consolidado');
    g1.innerHTML=''; g2.innerHTML=''; gc.innerHTML='';

    Object.keys(stats.setores).sort().forEach(k => { 
        const t1 = stats.setores[k]["1º TURNO"], t2 = stats.setores[k]["2º TURNO"];
        const p1 = calc(t1.fa, t1.ef), p2 = calc(t2.fa, t2.ef);
        
        g1.innerHTML += `<div class="mini-card border-t1"><h4>${k}</h4><div class="val ${parseFloat(p1)>5?'alert-text':''}">${p1}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Faltas/dia: ${(t1.fa/daysCount).toFixed(1)}</span></div>`; 
        g2.innerHTML += `<div class="mini-card border-t2"><h4>${k}</h4><div class="val ${parseFloat(p2)>5?'alert-text':''}">${p2}%</div><span class="sub-val"><i class="ph-bold ph-chart-bar"></i> Faltas/dia: ${(t2.fa/daysCount).toFixed(1)}</span></div>`; 
        
        const totEf = t1.ef + t2.ef, totFa = t1.fa + t2.fa;
        const pt = calc(totFa, totEf);
        gc.innerHTML += `<div class="mini-card border-sector"><h4>Total ${k}</h4><div class="val ${parseFloat(pt)>5?'alert-text':''}">${pt}%</div><span class="sub-val"><i class="ph-bold ph-sigma"></i> Faltas/dia: ${(totFa/daysCount).toFixed(1)}</span></div>`; 
    });

    const ctx = document.getElementById('chart-evolution'); 
    if (chartEvolution) chartEvolution.destroy(); 
    
    const setoresNomes = Object.keys(stats.setores).sort();
    const valoresSetores = setoresNomes.map(k => {
        const t1 = stats.setores[k]["1º TURNO"];
        const t2 = stats.setores[k]["2º TURNO"];
        const totEf = t1.ef + t2.ef;
        const totFa = t1.fa + t2.fa;
        return totEf > 0 ? parseFloat(((totFa/totEf)*100).toFixed(2)) : 0;
    });

    const paletaCores = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];

    chartEvolution = new Chart(ctx, { 
        type: 'bar', 
        data: { 
            labels: setoresNomes, 
            datasets: [{ 
                label: 'Absenteísmo Consolidado (%)', 
                data: valoresSetores, 
                backgroundColor: paletaCores, 
                barPercentage: 0.6, 
                borderRadius:6 
            }] 
        }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { y: { beginAtZero: true, grid:{color:'#f1f5f9'} }, x:{grid:{display:false}} }, 
            plugins: { 
                legend:{display:false}, 
                title:{display:true, text:'Absenteísmo Consolidado por Setor no Período', font:{size:16, family:"'Inter'", weight:600}, color:'#334155'}, 
                datalabels:{color:'#334155', anchor:'end', align:'top', offset:-4, font:{weight:'bold'}, formatter: v => v>0?v+'%':'0%'} 
            } 
        } 
    });
}

onAuthStateChanged(auth, u => {
    document.getElementById('auth-overlay').style.display = u ? 'none' : 'flex';
    document.getElementById('app-container').style.display = u ? 'flex' : 'none';
    if(u) {
        app.loadUserProfile(u.uid);
        
        onSnapshot(collection(db, "efetivos_vigencia"), snap => {
            marcosGlobais = [];
            snap.forEach(doc => marcosGlobais.push({ id: doc.id, ...doc.data() }));
            marcosGlobais.sort((a,b) => b.id.localeCompare(a.id));

            let hP3 = '', hP4 = '';
            marcosGlobais.forEach((m, i) => {
                let status = i === 0 ? '<span class="status-good">Ativo (Atual)</span>' : '<span style="color:#64748b; font-size:0.8rem;">Histórico</span>';
                let dataBr = m.id.split('-').reverse().join('/');
                
                const btnEditar = `<button class="btn-logout" style="color: #2563eb; background: none; border: 1px solid #bfdbfe; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'" onclick="app.editMarco('${m.id}')" title="Editar"><i class="ph-bold ph-pencil-simple"></i></button>`;
                const btnExcluir = `<button class="btn-logout" style="padding: 4px 8px; border-radius: 4px;" onclick="app.deleteMarco('${m.id}')" title="Excluir"><i class="ph-bold ph-trash"></i></button>`;
                
                const acoes = `<div style="display:flex; justify-content: center; gap: 8px;">${btnEditar} ${btnExcluir}</div>`;
                
                const linha = (setor, turno, val) => `<tr><td>${dataBr}</td><td>${setor} <small style="color:#64748b">(${turno})</small></td><td><b>${val}</b></td><td>${status}</td><td>${acoes}</td></tr>`;
                
                hP3 += linha('Fabricação', '1º T', m.fab_1) + linha('Fabricação', '2º T', m.fab_2) + linha('Mont. Estrutural', '1º T', m.est_1) + linha('Mont. Estrutural', '2º T', m.est_2);
                hP4 += linha('Montagem final', '1º T', m.mont_1) + linha('Montagem final', '2º T', m.mont_2) + linha('Painéis', '1º T', m.pain_1) + linha('Painéis', '2º T', m.pain_2);
                
                hP3 += `<tr style="background:#f1f5f9;"><td colspan=\"5\" style=\"padding:2px;\"></td></tr>`;
                hP4 += `<tr style="background:#f1f5f9;"><td colspan=\"5\" style=\"padding:2px;\"></td></tr>`;
            });

            document.querySelector('#table-p3 tbody').innerHTML = hP3 || `<tr><td colspan=\"5\" style=\"text-align:center;\">Sem registros.</td></tr>`;
            document.querySelector('#table-p4 tbody').innerHTML = hP4 || `<tr><td colspan=\"5\" style=\"text-align:center;\">Sem registros.</td></tr>`;
        });
        
        document.getElementById('dash-start').value = "2026-01-01"; 
        const today = new Date();
        const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        document.getElementById('dash-end').value = localToday;
    }
});
