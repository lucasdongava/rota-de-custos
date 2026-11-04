/* Rota de Custos — dados base do modelo (compartilhado entre o site e o coletor) */
window.TRIP_DATA = (function(){
/* Países: nome, unidades e projeção do mapa [função d3, rotate, parallels] */
const COUNTRIES = {
  BRA:{name:'Brasil', unit:'estados', one:'estado', title:'Custo da estadia por estado', proj:['geoConicConformal',[54,0],[-5,-25]]},
  USA:{name:'Estados Unidos', unit:'estados', one:'estado', title:'Custo da estadia por estado', proj:['geoAlbersUsa']},
  CAN:{name:'Canadá', unit:'províncias e territórios', one:'província', title:'Custo da estadia por província', proj:['geoConicConformal',[96,0],[49,77]]},
  MEX:{name:'México', unit:'estados', one:'estado', title:'Custo da estadia por estado', proj:['geoConicConformal',[102,0],[17.5,29.5]]},
  JPN:{name:'Japão', unit:'províncias', one:'província', title:'Custo da estadia por província', proj:['geoConicConformal',[-137,0],[33,44]]},
  CHN:{name:'China', unit:'províncias e regiões', one:'província', title:'Custo da estadia por província', proj:['geoConicEqualArea',[-105,0],[25,47]]}
};

/* ---------- perfis de sazonalidade (multiplicador mensal da hospedagem, jan→dez) ---------- */
const PROF = {
  sn:[.80,.80,.88,.92,1.00,1.15,1.25,1.22,1.05,.98,.85,.92],   // pico no verão do hemisfério norte
  ss:[.70,.70,.75,.82,1.00,1.30,1.45,1.40,1.10,.85,.70,.75],   // verão curto e forte
  ws:[1.25,1.30,1.30,1.12,.95,.88,.92,.85,.78,.85,1.00,1.22],  // sol de inverno (Flórida, Havaí, Hainan)
  sk:[1.30,1.32,1.25,.95,.80,.98,1.12,1.08,.88,.82,.90,1.25],  // neve + verão
  ct:[.82,.85,.95,1.02,1.08,1.10,1.06,1.03,1.08,1.10,1.00,1.05],// cidades
  ny:[.78,.80,.92,1.02,1.08,1.08,1.02,1.00,1.10,1.12,1.10,1.22],// Nova York
  mx:[1.08,.95,1.02,1.08,.92,.92,1.12,1.10,.86,.92,1.00,1.15], // México interior
  mb:[1.25,1.22,1.25,1.10,.85,.85,1.00,.98,.75,.82,.98,1.20],  // praias do México
  cn:[.95,1.05,.88,.98,1.05,.96,1.12,1.12,.98,1.10,.92,.92],   // China
  hb:[1.35,1.20,.82,.80,.88,.98,1.15,1.10,.92,.95,.82,1.02],   // Harbin (festival do gelo)
  qc:[.85,.98,.85,.82,.95,1.12,1.28,1.22,1.05,1.00,.82,.98],   // Quebec
  nt:[1.05,1.08,1.10,.85,.80,1.15,1.25,1.15,1.00,.85,.80,.95], // Territórios do Noroeste (aurora + verão)
  bp:[1.30,1.15,.95,.90,.82,.85,1.12,1.00,.90,.92,.95,1.25],   // praias do Brasil
  bc:[.92,.95,1.02,1.02,1.03,1.00,.98,1.02,1.05,1.05,1.02,.95], // capitais de negócios
  br:[1.30,1.20,.98,.95,.88,.88,.98,.92,.95,.95,.98,1.25],     // Rio de Janeiro
  bs:[1.10,1.05,.92,.92,.95,1.12,1.25,1.05,.92,.95,1.00,1.15], // serra gaúcha (inverno + Natal Luz)
  bn:[.98,.95,.95,.95,.98,1.05,1.12,1.05,.98,1.02,.98,1.00],   // Norte
  be:[1.02,.92,.90,.92,.98,1.05,1.20,1.15,1.10,.98,.92,1.05],  // ecoturismo (seca)
  bsc:[1.40,1.25,.95,.85,.80,.85,.95,.85,.88,.98,.95,1.25],     // litoral de SC
  jp:[.92,.88,1.08,1.22,1.02,.90,.98,1.12,.95,1.05,1.15,1.02],   // Japão: sakura, Golden Week, Obon, outono
  jpk:[.88,.85,1.12,1.38,1.05,.90,.95,1.00,.95,1.05,1.32,1.00],  // Quioto/Nara: sakura e folhas de outono
  jph:[1.20,1.32,.95,.85,.92,1.05,1.25,1.20,1.00,.95,.80,1.05],  // Hokkaido: neve e verão
  jpo:[.90,.90,1.00,1.00,1.02,.95,1.25,1.30,1.05,.95,.88,.90]    // Okinawa: praia no verão
};
/* ---------- regiões: nome, hotel, alimentação, transporte (US$/dia, média anual), perfil, 1 = cidade de negócios ---------- */
const R = {
 'BR-AC':['Acre',55,22,8,'bn'],'BR-AL':['Alagoas',95,28,10,'bp'],'BR-AP':['Amapá',60,24,9,'bn'],'BR-AM':['Amazonas',80,28,10,'bn'],
 'BR-BA':['Bahia',85,28,10,'bp'],'BR-CE':['Ceará',80,27,10,'bp'],'BR-DF':['Distrito Federal',85,30,12,'bc',1],'BR-ES':['Espírito Santo',70,25,10,'bp'],
 'BR-GO':['Goiás',60,23,9,'be'],'BR-MA':['Maranhão',70,24,9,'bp'],'BR-MT':['Mato Grosso',70,26,10,'be'],'BR-MS':['Mato Grosso do Sul',80,28,12,'be'],
 'BR-MG':['Minas Gerais',70,25,10,'bc'],'BR-PA':['Pará',65,25,9,'bn'],'BR-PB':['Paraíba',70,25,9,'bp'],'BR-PR':['Paraná',75,27,10,'bc'],
 'BR-PE':['Pernambuco',80,28,10,'bp'],'BR-PI':['Piauí',55,22,8,'bn'],'BR-RJ':['Rio de Janeiro',110,35,12,'br'],'BR-RN':['Rio Grande do Norte',85,27,10,'bp'],
 'BR-RS':['Rio Grande do Sul',80,30,10,'bs'],'BR-RO':['Rondônia',55,22,8,'bn'],'BR-RR':['Roraima',65,25,9,'bn'],'BR-SC':['Santa Catarina',95,30,11,'bsc'],
 'BR-SP':['São Paulo',95,35,12,'bc',1],'BR-SE':['Sergipe',65,24,9,'bp'],'BR-TO':['Tocantins',60,23,10,'be'],

 'JP-01':['Hokkaido',120,40,15,'jph'],'JP-02':['Aomori',80,30,9,'jp'],'JP-03':['Iwate',78,30,9,'jp'],'JP-04':['Miyagi',95,33,9,'jp'],
 'JP-05':['Akita',78,30,9,'jp'],'JP-06':['Yamagata',80,30,9,'jp'],'JP-07':['Fukushima',82,30,9,'jp'],'JP-08':['Ibaraki',80,30,9,'jp'],
 'JP-09':['Tochigi',85,30,9,'jp'],'JP-10':['Gunma',85,30,9,'jp'],'JP-11':['Saitama',90,32,8,'jp'],'JP-12':['Chiba',110,35,10,'jp'],
 'JP-13':['Tóquio',170,45,12,'jp',1],'JP-14':['Kanagawa',130,40,10,'jp'],'JP-15':['Niigata',85,32,9,'jp'],'JP-16':['Toyama',90,33,9,'jp'],
 'JP-17':['Ishikawa',115,38,9,'jpk'],'JP-18':['Fukui',85,32,9,'jp'],'JP-19':['Yamanashi',115,35,11,'jp'],'JP-20':['Nagano',105,35,11,'jph'],
 'JP-21':['Gifu',95,33,9,'jp'],'JP-22':['Shizuoka',100,34,10,'jp'],'JP-23':['Aichi',110,38,10,'jp',1],'JP-24':['Mie',100,34,10,'jp'],
 'JP-25':['Shiga',90,32,9,'jp'],'JP-26':['Quioto',160,45,10,'jpk'],'JP-27':['Osaka',130,40,10,'jp',1],'JP-28':['Hyōgo',110,38,10,'jp'],
 'JP-29':['Nara',110,35,8,'jpk'],'JP-30':['Wakayama',95,33,10,'jp'],'JP-31':['Tottori',78,30,9,'jp'],'JP-32':['Shimane',80,30,9,'jp'],
 'JP-33':['Okayama',90,32,9,'jp'],'JP-34':['Hiroshima',105,35,9,'jp'],'JP-35':['Yamaguchi',80,30,9,'jp'],'JP-36':['Tokushima',80,30,9,'jp'],
 'JP-37':['Kagawa',88,32,9,'jp'],'JP-38':['Ehime',85,32,9,'jp'],'JP-39':['Kochi',82,32,9,'jp'],'JP-40':['Fukuoka',100,35,9,'jp',1],
 'JP-41':['Saga',80,30,9,'jp'],'JP-42':['Nagasaki',95,33,9,'jp'],'JP-43':['Kumamoto',90,33,9,'jp'],'JP-44':['Oita',100,33,9,'jp'],
 'JP-45':['Miyazaki',85,32,9,'jp'],'JP-46':['Kagoshima',92,33,10,'jp'],'JP-47':['Okinawa',140,40,15,'jpo'],

 'US-AL':['Alabama',120,55,25,'sn'],'US-AK':['Alasca',210,80,40,'ss'],'US-AZ':['Arizona',160,60,30,'ws'],'US-AR':['Arkansas',110,50,25,'sn'],
 'US-CA':['Califórnia',230,80,35,'ct'],'US-CO':['Colorado',190,65,30,'sk'],'US-CT':['Connecticut',170,70,30,'sn'],'US-DE':['Delaware',150,65,25,'sn'],
 'US-DC':['Washington, D.C.',260,85,25,'ct',1],'US-FL':['Flórida',210,70,35,'ws'],'US-GA':['Geórgia',150,60,30,'ct'],'US-HI':['Havaí',340,95,45,'ws'],
 'US-ID':['Idaho',140,55,30,'sn'],'US-IL':['Illinois',190,70,25,'ct',1],'US-IN':['Indiana',120,55,25,'sn'],'US-IA':['Iowa',110,50,25,'sn'],
 'US-KS':['Kansas',110,50,25,'sn'],'US-KY':['Kentucky',125,55,25,'sn'],'US-LA':['Luisiana',170,70,30,'ct'],'US-ME':['Maine',175,65,30,'ss'],
 'US-MD':['Maryland',160,65,25,'sn'],'US-MA':['Massachusetts',240,80,30,'ct'],'US-MI':['Michigan',140,60,30,'sn'],'US-MN':['Minnesota',140,60,30,'sn'],
 'US-MS':['Mississippi',105,50,25,'sn'],'US-MO':['Missouri',130,55,25,'sn'],'US-MT':['Montana',165,60,35,'ss'],'US-NE':['Nebraska',115,50,25,'sn'],
 'US-NV':['Nevada',165,70,30,'ct'],'US-NH':['Nova Hampshire',165,65,30,'sn'],'US-NJ':['Nova Jersey',180,72,30,'sn'],'US-NM':['Novo México',135,55,30,'sn'],
 'US-NY':['Nova York',300,90,30,'ny',1],'US-NC':['Carolina do Norte',140,58,28,'sn'],'US-ND':['Dakota do Norte',115,50,25,'sn'],'US-OH':['Ohio',125,55,25,'sn'],
 'US-OK':['Oklahoma',110,50,25,'sn'],'US-OR':['Oregon',165,65,30,'sn'],'US-PA':['Pensilvânia',155,62,28,'ct'],'US-RI':['Rhode Island',190,70,28,'ss'],
 'US-SC':['Carolina do Sul',160,60,30,'sn'],'US-SD':['Dakota do Sul',125,52,30,'ss'],'US-TN':['Tennessee',175,65,30,'ct'],'US-TX':['Texas',155,60,30,'ct'],
 'US-UT':['Utah',165,60,30,'sk'],'US-VT':['Vermont',190,68,30,'sk'],'US-VA':['Virgínia',150,62,28,'sn'],'US-WA':['Washington',200,72,30,'sn'],
 'US-WV':['Virgínia Ocidental',115,50,25,'sn'],'US-WI':['Wisconsin',130,55,25,'sn'],'US-WY':['Wyoming',185,62,35,'ss'],

 'CA-BC':['Colúmbia Britânica',200,70,30,'sn'],'CA-AB':['Alberta',170,62,30,'sk'],'CA-SK':['Saskatchewan',115,52,25,'sn'],'CA-MB':['Manitoba',120,52,25,'sn'],
 'CA-ON':['Ontário',185,68,30,'ct',1],'CA-QC':['Quebec',170,65,28,'qc'],'CA-NB':['Nova Brunswick',130,55,28,'ss'],'CA-NS':['Nova Escócia',155,60,28,'ss'],
 'CA-PE':['Ilha do Príncipe Eduardo',165,60,30,'ss'],'CA-NL':['Terra Nova e Labrador',150,62,32,'ss'],'CA-YT':['Yukon',180,70,40,'nt'],
 'CA-NT':['Territórios do Noroeste',210,80,45,'nt'],'CA-NU':['Nunavut',280,95,50,'ss'],

 'MX-AGU':['Aguascalientes',60,25,10,'mx'],'MX-BCN':['Baja California',85,32,14,'mx'],'MX-BCS':['Baja California Sur',210,55,25,'mb'],
 'MX-CAM':['Campeche',65,25,10,'mx'],'MX-CHP':['Chiapas',60,22,10,'mx'],'MX-CHH':['Chihuahua',70,28,12,'mx'],'MX-COA':['Coahuila',70,28,12,'mx',1],
 'MX-COL':['Colima',75,28,12,'mb'],'MX-DIF':['Cidade do México',110,35,10,'mx',1],'MX-DUR':['Durango',55,24,10,'mx'],'MX-GUA':['Guanajuato',85,30,12,'mx'],
 'MX-GRO':['Guerrero',95,32,14,'mb'],'MX-HID':['Hidalgo',55,24,10,'mx'],'MX-JAL':['Jalisco',105,35,14,'mb'],'MX-MEX':['Estado do México',65,26,10,'mx'],
 'MX-MIC':['Michoacán',70,26,10,'mx'],'MX-MOR':['Morelos',85,30,12,'mx'],'MX-NAY':['Nayarit',140,42,18,'mb'],'MX-NLE':['Nuevo León',95,35,14,'mx',1],
 'MX-OAX':['Oaxaca',90,30,12,'mx'],'MX-PUE':['Puebla',70,28,10,'mx'],'MX-QUE':['Querétaro',85,32,12,'mx'],'MX-ROO':['Quintana Roo',230,60,25,'mb'],
 'MX-SLP':['San Luis Potosí',60,25,10,'mx'],'MX-SIN':['Sinaloa',85,30,12,'mb'],'MX-SON':['Sonora',75,30,13,'mx'],'MX-TAB':['Tabasco',65,26,10,'mx'],
 'MX-TAM':['Tamaulipas',60,25,10,'mx'],'MX-TLA':['Tlaxcala',50,22,9,'mx'],'MX-VER':['Veracruz',70,27,11,'mx'],'MX-YUC':['Yucatán',105,34,12,'mx'],
 'MX-ZAC':['Zacatecas',60,24,10,'mx'],

 'CN-BJ':['Pequim',120,40,10,'cn',1],'CN-SH':['Xangai',135,45,10,'cn',1],'CN-TJ':['Tianjin',75,30,8,'cn'],'CN-CQ':['Chongqing',65,26,8,'cn'],
 'CN-HE':['Hebei',55,22,7,'cn'],'CN-SX':['Shanxi',55,22,7,'cn'],'CN-NM':['Mongólia Interior',65,25,9,'sn'],'CN-LN':['Liaoning',60,25,8,'cn'],
 'CN-JL':['Jilin',55,24,8,'hb'],'CN-HL':['Heilongjiang',60,25,8,'hb'],'CN-JS':['Jiangsu',80,32,9,'cn'],'CN-ZJ':['Zhejiang',90,35,9,'cn'],
 'CN-AH':['Anhui',55,23,7,'cn'],'CN-FJ':['Fujian',70,28,8,'cn'],'CN-JX':['Jiangxi',55,22,7,'cn'],'CN-SD':['Shandong',65,26,8,'cn'],
 'CN-HA':['Henan',55,22,7,'cn'],'CN-HB':['Hubei',60,24,8,'cn'],'CN-HN':['Hunan',60,24,8,'cn'],'CN-GD':['Guangdong',90,35,10,'cn',1],
 'CN-GX':['Guangxi',60,24,8,'cn'],'CN-HI':['Hainan',130,40,12,'ws'],'CN-SC':['Sichuan',70,28,8,'cn'],'CN-GZ':['Guizhou',55,22,7,'cn'],
 'CN-YN':['Yunnan',75,26,9,'cn'],'CN-XZ':['Tibete',100,30,15,'ss'],'CN-SN':['Shaanxi',65,26,8,'cn'],'CN-GS':['Gansu',55,22,8,'sn'],
 'CN-QH':['Qinghai',60,24,9,'ss'],'CN-NX':['Ningxia',50,22,7,'cn'],'CN-XJ':['Xinjiang',70,26,10,'sn'],'CN-HK':['Hong Kong',190,55,12,'ct',1],
 'CN-MO':['Macau',170,50,10,'ct']
};
/* ---------- feriados e eventos: calculados automaticamente para qualquer ano ---------- */
// Ano-Novo Chinês (calendário lunar), 2025–2040
const CNY = {2025:'01-29',2026:'02-17',2027:'02-06',2028:'01-26',2029:'02-13',2030:'02-03',2031:'01-23',2032:'02-11',2033:'01-31',
  2034:'02-19',2035:'02-08',2036:'01-28',2037:'02-15',2038:'02-04',2039:'01-24',2040:'02-12'};
const _D = 864e5;
const _u = (y,m,d) => Date.UTC(y,m-1,d);
const _iso = t => new Date(t).toISOString().slice(0,10);
function easter(y){ // algoritmo de Meeus/Jones/Butcher
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return _u(y,mo,da);
}
const nthWeekday = (y,m,wd,n) => { let t=_u(y,m,1); while(new Date(t).getUTCDay()!==wd) t+=_D; return t+(n-1)*7*_D; };
const lastWeekday = (y,m,wd) => { let t=_u(y,m+1,1)-_D; while(new Date(t).getUTCDay()!==wd) t-=_D; return t; };
function holidaysFor(y){
  const E=easter(y), H=[], add=(c,a,b,m,n,only)=>H.push({c,a:_iso(a),b:_iso(b),m,n,only});
  // Brasil
  add('BRA',_u(y,11,19),_u(y,11,22),1.08,'Consciência Negra');
  add('BRA',_u(y,11,13),_u(y,11,16),1.08,'Proclamação da República');
  add('BRA',_u(y,12,21),_u(y,12,26),1.10,'Natal');
  add('BRA',_u(y,12,27),_u(y+1,1,2),1.35,'Réveillon');
  add('BRA',_u(y,12,29),_u(y+1,1,1),1.70,'Réveillon em Copacabana',['BR-RJ']);
  add('BRA',E-51*_D,E-46*_D,1.15,'Carnaval');
  add('BRA',E-51*_D,E-46*_D,1.70,'Carnaval',['BR-BA','BR-PE','BR-RJ']);
  add('BRA',E-3*_D,E,1.12,'Semana Santa');
  add('BRA',E+60*_D,E+63*_D,1.08,'Corpus Christi');
  add('BRA',_u(y,6,20),_u(y,6,29),1.50,'São João',['BR-PB','BR-PE']);
  const pa=lastWeekday(y,6,0); add('BRA',pa-3*_D,pa,1.60,'Festival de Parintins',['BR-AM']);
  const ok=nthWeekday(y,10,3,1); add('BRA',ok,ok+18*_D,1.25,'Oktoberfest de Blumenau',['BR-SC']);
  const ci=nthWeekday(y,10,0,2); add('BRA',ci-2*_D,ci+_D,1.40,'Círio de Nazaré',['BR-PA']);
  // Estados Unidos
  const tg=nthWeekday(y,11,4,4); add('USA',tg-_D,tg+3*_D,1.20,'Ação de Graças');
  add('USA',_u(y,12,21),_u(y+1,1,2),1.25,'Natal e Ano-Novo');
  add('USA',_u(y,12,29),_u(y+1,1,1),1.45,'Réveillon em NY',['US-NY']);
  add('USA',E-51*_D,E-47*_D,1.60,'Mardi Gras',['US-LA']);
  add('USA',_u(y,3,6),_u(y,3,27),1.15,'Spring break',['US-FL']);
  const md=lastWeekday(y,5,1); add('USA',md-3*_D,md,1.10,'Memorial Day');
  add('USA',_u(y,7,2),_u(y,7,5),1.15,'4 de Julho');
  const lb=nthWeekday(y,9,1,1); add('USA',lb-2*_D,lb,1.10,'Labor Day');
  // Canadá
  add('CAN',_u(y,12,21),_u(y+1,1,2),1.20,'Natal e Ano-Novo');
  const qc=nthWeekday(y,2,5,1); add('CAN',qc,qc+9*_D,1.25,'Carnaval de Quebec',['CA-QC']);
  add('CAN',_u(y,6,30),_u(y,7,2),1.10,'Canada Day');
  // México
  add('MEX',_u(y,12,18),_u(y+1,1,3),1.30,'Natal e Ano-Novo');
  add('MEX',E-8*_D,E+7*_D,1.30,'Semana Santa e Páscoa');
  add('MEX',_u(y,10,29),_u(y,11,2),1.35,'Día de Muertos',['MX-OAX','MX-DIF','MX-MIC']);
  // Japão
  add('JPN',_u(y,4,29),_u(y,5,5),1.35,'Golden Week');
  add('JPN',_u(y,8,11),_u(y,8,16),1.25,'Obon');
  add('JPN',_u(y,12,29),_u(y+1,1,3),1.30,'Ano-Novo');
  const sp=nthWeekday(y,2,0,1); add('JPN',sp-2*_D,sp+7*_D,1.40,'Festival da Neve de Sapporo',['JP-01']);
  add('JPN',_u(y,7,14),_u(y,7,17),1.25,'Gion Matsuri',['JP-26']);
  // China
  add('CHN',_u(y,12,31),_u(y+1,1,2),1.10,'Ano-Novo');
  if (CNY[y]){ const c=Date.UTC(y,+CNY[y].slice(0,2)-1,+CNY[y].slice(3)); add('CHN',c-_D,c+5*_D,1.30,'Ano-Novo Chinês'); }
  add('CHN',_u(y,5,1),_u(y,5,5),1.35,'Feriado de 1º de Maio');
  add('CHN',_u(y,10,1),_u(y,10,7),1.50,'Golden Week');
  return H;
}
// feriados do ano anterior até 3 anos à frente
const _Y = new Date().getUTCFullYear();
const HOL = [].concat(...[ _Y-1, _Y, _Y+1, _Y+2, _Y+3 ].map(holidaysFor));

/* Atalhos de período: sempre a próxima ocorrência a partir de hoje */
function presets(today){
  const t0 = today ?? Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const next = f => { for (let y=_Y; y<=_Y+2; y++){ const [a,b]=f(y); if (a>t0) return [a,b,y]; } return f(_Y+2).concat(_Y+2); };
  const P = [
    ['Natal e Ano-Novo', y=>[_u(y,12,20),_u(y+1,1,3)], false],
    ['Carnaval', y=>{const E=easter(y); return [E-51*_D,E-42*_D];}, true],
    ['Semana Santa', y=>{const E=easter(y); return [E-4*_D,E+_D];}, true],
    ['Férias de julho', y=>[_u(y,7,5),_u(y,7,19)], true],
    ['Golden Week', y=>[_u(y,9,30),_u(y,10,8)], false]
  ];
  return P.map(([l,f,withYear])=>{ const [a,b,y]=next(f); return {l: withYear?`${l} ${y}`:l, a:_iso(a), b:_iso(b)}; });
}
const PRESETS = presets();

/* ---------- aeroportos e voos (modelo de estimativa) ---------- */
const AP = {
 // Brasil
 RBR:[-9.87,-67.90,'Rio Branco'],MCZ:[-9.51,-35.79,'Maceió'],MCP:[0.05,-51.07,'Macapá'],MAO:[-3.04,-60.05,'Manaus'],SSA:[-12.91,-38.33,'Salvador'],
 FOR:[-3.78,-38.53,'Fortaleza'],BSB:[-15.87,-47.92,'Brasília'],VIX:[-20.26,-40.29,'Vitória'],GYN:[-16.63,-49.22,'Goiânia'],SLZ:[-2.59,-44.24,'São Luís'],
 CGB:[-15.65,-56.12,'Cuiabá'],CGR:[-20.47,-54.67,'Campo Grande'],CNF:[-19.62,-43.97,'Belo Horizonte'],BEL:[-1.38,-48.48,'Belém'],JPA:[-7.15,-34.95,'João Pessoa'],
 CWB:[-25.53,-49.18,'Curitiba'],REC:[-8.13,-34.92,'Recife'],THE:[-5.06,-42.82,'Teresina'],GIG:[-22.81,-43.25,'Rio de Janeiro'],NAT:[-5.77,-35.37,'Natal'],
 POA:[-29.99,-51.17,'Porto Alegre'],PVH:[-8.71,-63.90,'Porto Velho'],BVB:[2.85,-60.69,'Boa Vista'],FLN:[-27.67,-48.55,'Florianópolis'],GRU:[-23.43,-46.47,'São Paulo'],
 CGH:[-23.63,-46.66,'São Paulo (Congonhas)'],VCP:[-23.01,-47.13,'Campinas'],AJU:[-10.98,-37.07,'Aracaju'],PMW:[-10.29,-48.36,'Palmas'],
 // EUA
 BHM:[33.56,-86.75,'Birmingham'],ANC:[61.17,-149.99,'Anchorage'],PHX:[33.43,-112.01,'Phoenix'],LIT:[34.73,-92.22,'Little Rock'],
 LAX:[33.94,-118.41,'Los Angeles'],DEN:[39.86,-104.67,'Denver'],BDL:[41.94,-72.68,'Hartford'],PHL:[39.87,-75.24,'Filadélfia'],
 IAD:[38.95,-77.46,'Washington'],MIA:[25.79,-80.29,'Miami'],MCO:[28.43,-81.31,'Orlando'],FLL:[26.07,-80.15,'Fort Lauderdale'],TPA:[27.98,-82.53,'Tampa'],
 ATL:[33.64,-84.43,'Atlanta'],HNL:[21.32,-157.92,'Honolulu'],BOI:[43.56,-116.22,'Boise'],ORD:[41.98,-87.90,'Chicago'],IND:[39.72,-86.29,'Indianápolis'],
 DSM:[41.53,-93.66,'Des Moines'],ICT:[37.65,-97.43,'Wichita'],SDF:[38.17,-85.74,'Louisville'],MSY:[29.99,-90.26,'Nova Orleans'],PWM:[43.65,-70.31,'Portland (ME)'],
 BWI:[39.18,-76.67,'Baltimore'],BOS:[42.36,-71.01,'Boston'],DTW:[42.21,-83.35,'Detroit'],MSP:[44.88,-93.22,'Minneapolis'],JAN:[32.31,-90.08,'Jackson'],
 STL:[38.75,-90.37,'St. Louis'],BZN:[45.78,-111.15,'Bozeman'],OMA:[41.30,-95.89,'Omaha'],LAS:[36.08,-115.15,'Las Vegas'],MHT:[42.93,-71.44,'Manchester'],
 EWR:[40.69,-74.17,'Newark'],ABQ:[35.04,-106.61,'Albuquerque'],JFK:[40.64,-73.78,'Nova York'],CLT:[35.21,-80.94,'Charlotte'],FAR:[46.92,-96.82,'Fargo'],
 CMH:[40.00,-82.89,'Columbus'],OKC:[35.39,-97.60,'Oklahoma City'],PDX:[45.59,-122.60,'Portland'],PVD:[41.72,-71.43,'Providence'],CHS:[32.90,-80.04,'Charleston'],
 FSD:[43.58,-96.74,'Sioux Falls'],BNA:[36.12,-86.68,'Nashville'],DFW:[32.90,-97.04,'Dallas'],IAH:[29.98,-95.34,'Houston'],SLC:[40.79,-111.98,'Salt Lake City'],
 BTV:[44.47,-73.15,'Burlington'],RIC:[37.51,-77.32,'Richmond'],SEA:[47.45,-122.31,'Seattle'],SFO:[37.62,-122.38,'São Francisco'],CRW:[38.37,-81.59,'Charleston (WV)'],
 MKE:[42.95,-87.90,'Milwaukee'],JAC:[43.61,-110.74,'Jackson Hole'],
 // Canadá
 YVR:[49.19,-123.18,'Vancouver'],YYC:[51.13,-114.01,'Calgary'],YXE:[52.17,-106.70,'Saskatoon'],YWG:[49.91,-97.24,'Winnipeg'],YYZ:[43.68,-79.63,'Toronto'],
 YUL:[45.47,-73.74,'Montreal'],YQM:[46.11,-64.68,'Moncton'],YHZ:[44.88,-63.51,'Halifax'],YYG:[46.29,-63.12,'Charlottetown'],YYT:[47.62,-52.75,"St. John's"],
 YXY:[60.71,-135.07,'Whitehorse'],YZF:[62.46,-114.44,'Yellowknife'],YFB:[63.76,-68.56,'Iqaluit'],
 // México
 AGU:[21.71,-102.32,'Aguascalientes'],TIJ:[32.54,-116.97,'Tijuana'],SJD:[23.15,-109.72,'Los Cabos'],CPE:[19.82,-90.50,'Campeche'],TGZ:[16.56,-93.02,'Tuxtla Gutiérrez'],
 CUU:[28.70,-105.96,'Chihuahua'],TRC:[25.57,-103.41,'Torreón'],ZLO:[19.14,-104.56,'Manzanillo'],MEX:[19.44,-99.07,'Cidade do México'],DGO:[24.12,-104.53,'Durango'],
 BJX:[20.99,-101.48,'León'],ACA:[16.76,-99.75,'Acapulco'],GDL:[20.52,-103.31,'Guadalajara'],TLC:[19.34,-99.57,'Toluca'],MLM:[19.85,-101.03,'Morelia'],
 PVR:[20.68,-105.25,'Puerto Vallarta'],MTY:[25.78,-100.11,'Monterrey'],OAX:[17.00,-96.73,'Oaxaca'],PBC:[19.16,-98.37,'Puebla'],QRO:[20.62,-100.19,'Querétaro'],
 CUN:[21.04,-86.87,'Cancún'],SLP:[22.25,-100.93,'San Luis Potosí'],MZT:[23.16,-106.27,'Mazatlán'],HMO:[29.10,-111.05,'Hermosillo'],VSA:[17.99,-92.82,'Villahermosa'],
 TAM:[22.30,-97.87,'Tampico'],VER:[19.15,-96.19,'Veracruz'],MID:[20.94,-89.66,'Mérida'],ZCL:[22.90,-102.69,'Zacatecas'],
 // Japão (os que começam com _ são cidades sem aeroporto; o 4º valor é o aeroporto usado nas buscas de preço)
 HND:[35.55,139.78,'Tóquio (Haneda)'],NRT:[35.77,140.39,'Tóquio (Narita)'],KIX:[34.43,135.23,'Osaka (Kansai)'],ITM:[34.79,135.44,'Osaka (Itami)'],
 NGO:[34.86,136.81,'Nagoia'],CTS:[42.78,141.69,'Sapporo'],FUK:[33.59,130.45,'Fukuoka'],OKA:[26.20,127.65,'Naha'],HIJ:[34.44,132.92,'Hiroshima'],
 SDJ:[38.14,140.92,'Sendai'],KOJ:[31.80,130.72,'Kagoshima'],KMJ:[32.84,130.86,'Kumamoto'],NGS:[32.92,129.91,'Nagasaki'],OIT:[33.48,131.74,'Oita'],
 KMI:[31.88,131.45,'Miyazaki'],KMQ:[36.39,136.41,'Komatsu'],TOY:[36.65,137.19,'Toyama'],KIJ:[37.96,139.12,'Niigata'],AOJ:[40.73,140.69,'Aomori'],
 HNA:[39.43,141.14,'Hanamaki'],AXT:[39.62,140.22,'Akita'],GAJ:[38.41,140.37,'Yamagata'],FKS:[37.23,140.43,'Fukushima'],IBR:[36.18,140.41,'Ibaraki'],
 OKJ:[34.76,133.86,'Okayama'],UBJ:[33.93,131.28,'Ube'],TKS:[34.13,134.61,'Tokushima'],TAK:[34.21,134.02,'Takamatsu'],MYJ:[33.83,132.70,'Matsuyama'],
 KCZ:[33.55,133.67,'Kochi'],TTJ:[35.53,134.17,'Tottori'],IZO:[35.41,132.89,'Izumo'],HSG:[33.15,130.30,'Saga'],FSZ:[34.80,138.19,'Shizuoka'],
 MMJ:[36.17,137.92,'Matsumoto'],SHM:[33.66,135.36,'Shirahama'],UKB:[34.63,135.22,'Kobe'],
 _KYO:[35.01,135.77,'Quioto','KIX'],_NAR:[34.68,135.80,'Nara','KIX'],_YOK:[35.44,139.64,'Yokohama','HND'],_SAI:[35.86,139.65,'Saitama','HND'],
 _UTS:[36.56,139.88,'Utsunomiya','HND'],_MAE:[36.39,139.06,'Maebashi','HND'],_KOF:[35.66,138.57,'Kofu','HND'],_OTS:[35.00,135.87,'Otsu','KIX'],
 _TSU:[34.73,136.51,'Tsu','NGO'],_GIF:[35.42,136.76,'Gifu','NGO'],_FKI:[36.06,136.22,'Fukui','KMQ'],
 // China
 PEK:[40.08,116.58,'Pequim'],PVG:[31.14,121.81,'Xangai'],TSN:[39.12,117.35,'Tianjin'],CKG:[29.72,106.64,'Chongqing'],SJW:[38.28,114.70,'Shijiazhuang'],
 TYN:[37.75,112.63,'Taiyuan'],HET:[40.85,111.82,'Hohhot'],SHE:[41.64,123.48,'Shenyang'],CGQ:[44.00,125.68,'Changchun'],HRB:[45.62,126.25,'Harbin'],
 NKG:[31.74,118.86,'Nanjing'],HGH:[30.23,120.43,'Hangzhou'],HFE:[31.99,116.97,'Hefei'],XMN:[24.54,118.13,'Xiamen'],KHN:[28.86,115.90,'Nanchang'],
 TAO:[36.36,120.09,'Qingdao'],CGO:[34.52,113.84,'Zhengzhou'],WUH:[30.78,114.21,'Wuhan'],CSX:[28.19,113.22,'Changsha'],CAN:[23.39,113.30,'Cantão'],
 KWL:[25.22,110.04,'Guilin'],SYX:[18.30,109.41,'Sanya'],TFU:[30.32,104.44,'Chengdu'],KWE:[26.54,106.80,'Guiyang'],KMG:[25.10,102.93,'Kunming'],
 LXA:[29.30,90.91,'Lhasa'],XIY:[34.45,108.75,"Xi'an"],LHW:[36.52,103.62,'Lanzhou'],XNN:[36.53,102.04,'Xining'],INC:[38.32,106.39,'Yinchuan'],
 URC:[43.91,87.47,'Ürümqi'],HKG:[22.31,113.91,'Hong Kong'],MFM:[22.15,113.59,'Macau']
};
const GW = {
 'JP-01':'CTS','JP-02':'AOJ','JP-03':'HNA','JP-04':'SDJ','JP-05':'AXT','JP-06':'GAJ','JP-07':'FKS','JP-08':'IBR','JP-09':'_UTS','JP-10':'_MAE','JP-11':'_SAI','JP-12':'NRT',
 'JP-13':'HND','JP-14':'_YOK','JP-15':'KIJ','JP-16':'TOY','JP-17':'KMQ','JP-18':'_FKI','JP-19':'_KOF','JP-20':'MMJ','JP-21':'_GIF','JP-22':'FSZ','JP-23':'NGO','JP-24':'_TSU',
 'JP-25':'_OTS','JP-26':'_KYO','JP-27':'KIX','JP-28':'UKB','JP-29':'_NAR','JP-30':'SHM','JP-31':'TTJ','JP-32':'IZO','JP-33':'OKJ','JP-34':'HIJ','JP-35':'UBJ','JP-36':'TKS',
 'JP-37':'TAK','JP-38':'MYJ','JP-39':'KCZ','JP-40':'FUK','JP-41':'HSG','JP-42':'NGS','JP-43':'KMJ','JP-44':'OIT','JP-45':'KMI','JP-46':'KOJ','JP-47':'OKA',
 'BR-AC':'RBR','BR-AL':'MCZ','BR-AP':'MCP','BR-AM':'MAO','BR-BA':'SSA','BR-CE':'FOR','BR-DF':'BSB','BR-ES':'VIX','BR-GO':'GYN','BR-MA':'SLZ',
 'BR-MT':'CGB','BR-MS':'CGR','BR-MG':'CNF','BR-PA':'BEL','BR-PB':'JPA','BR-PR':'CWB','BR-PE':'REC','BR-PI':'THE','BR-RJ':'GIG','BR-RN':'NAT',
 'BR-RS':'POA','BR-RO':'PVH','BR-RR':'BVB','BR-SC':'FLN','BR-SP':'GRU','BR-SE':'AJU','BR-TO':'PMW',
 'US-AL':'BHM','US-AK':'ANC','US-AZ':'PHX','US-AR':'LIT','US-CA':'LAX','US-CO':'DEN','US-CT':'BDL','US-DE':'PHL','US-DC':'IAD','US-FL':'MCO','US-GA':'ATL',
 'US-HI':'HNL','US-ID':'BOI','US-IL':'ORD','US-IN':'IND','US-IA':'DSM','US-KS':'ICT','US-KY':'SDF','US-LA':'MSY','US-ME':'PWM','US-MD':'BWI','US-MA':'BOS',
 'US-MI':'DTW','US-MN':'MSP','US-MS':'JAN','US-MO':'STL','US-MT':'BZN','US-NE':'OMA','US-NV':'LAS','US-NH':'MHT','US-NJ':'EWR','US-NM':'ABQ','US-NY':'JFK',
 'US-NC':'CLT','US-ND':'FAR','US-OH':'CMH','US-OK':'OKC','US-OR':'PDX','US-PA':'PHL','US-RI':'PVD','US-SC':'CHS','US-SD':'FSD','US-TN':'BNA','US-TX':'DFW',
 'US-UT':'SLC','US-VT':'BTV','US-VA':'RIC','US-WA':'SEA','US-WV':'CRW','US-WI':'MKE','US-WY':'JAC',
 'CA-BC':'YVR','CA-AB':'YYC','CA-SK':'YXE','CA-MB':'YWG','CA-ON':'YYZ','CA-QC':'YUL','CA-NB':'YQM','CA-NS':'YHZ','CA-PE':'YYG','CA-NL':'YYT',
 'CA-YT':'YXY','CA-NT':'YZF','CA-NU':'YFB',
 'MX-AGU':'AGU','MX-BCN':'TIJ','MX-BCS':'SJD','MX-CAM':'CPE','MX-CHP':'TGZ','MX-CHH':'CUU','MX-COA':'TRC','MX-COL':'ZLO','MX-DIF':'MEX','MX-DUR':'DGO',
 'MX-GUA':'BJX','MX-GRO':'ACA','MX-HID':'MEX','MX-JAL':'GDL','MX-MEX':'TLC','MX-MIC':'MLM','MX-MOR':'MEX','MX-NAY':'PVR','MX-NLE':'MTY','MX-OAX':'OAX',
 'MX-PUE':'PBC','MX-QUE':'QRO','MX-ROO':'CUN','MX-SLP':'SLP','MX-SIN':'MZT','MX-SON':'HMO','MX-TAB':'VSA','MX-TAM':'TAM','MX-TLA':'PBC','MX-VER':'VER',
 'MX-YUC':'MID','MX-ZAC':'ZCL',
 'CN-BJ':'PEK','CN-SH':'PVG','CN-TJ':'TSN','CN-CQ':'CKG','CN-HE':'SJW','CN-SX':'TYN','CN-NM':'HET','CN-LN':'SHE','CN-JL':'CGQ','CN-HL':'HRB','CN-JS':'NKG',
 'CN-ZJ':'HGH','CN-AH':'HFE','CN-FJ':'XMN','CN-JX':'KHN','CN-SD':'TAO','CN-HA':'CGO','CN-HB':'WUH','CN-HN':'CSX','CN-GD':'CAN','CN-GX':'KWL','CN-HI':'SYX',
 'CN-SC':'TFU','CN-GZ':'KWE','CN-YN':'KMG','CN-XZ':'LXA','CN-SN':'XIY','CN-GS':'LHW','CN-QH':'XNN','CN-NX':'INC','CN-XJ':'URC','CN-HK':'HKG','CN-MO':'MFM'
};
// Exemplo mostrado quando nenhum estado está selecionado
const GW_DEFAULT = {BRA:'BR-BA', USA:'US-FL', CAN:'CA-ON', MEX:'MX-ROO', CHN:'CN-BJ', JPN:'JP-13'};
// pre: aeroporto brasileiro de conexão a partir de VIX · via: [hub, horas até o hub, conexão, flag] · dest: horas até cada cidade · dom: segue em voo doméstico
const PRE = {GRU:1.3, VCP:1.3, BSB:1.7};
const AIRLINES = {
 BRA:[  // domésticas: voo direto entre capitais grandes; senão, conexão no hub da companhia
  {n:'LATAM', q:7.1, base:150, km:0.055, lay:1.5, hubs:['GRU','CGH','BSB'], dom:true},
  {n:'GOL', q:6.4, base:140, km:0.055, lay:1.5, hubs:['GRU','CGH','GIG','BSB'], dom:true},
  {n:'Azul', q:7.3, base:155, km:0.055, lay:1.5, hubs:['VCP','CNF','REC'], dom:true}
 ],
 USA:[
  {n:'LATAM', q:7.1, base:920, pre:'GRU', dest:{MIA:8.5,JFK:10,MCO:8.7,BOS:10}, dom:true},
  {n:'American Airlines', q:6.4, base:900, pre:'GRU', dest:{MIA:8.5,DFW:10.2,JFK:10}, dom:true},
  {n:'Delta', q:7.4, base:950, pre:'GRU', dest:{ATL:9.5,JFK:10}, dom:true},
  {n:'United', q:6.6, base:880, pre:'GRU', dest:{IAH:10.2,EWR:10}, dom:true},
  {n:'Azul', q:7.1, base:860, pre:'VCP', dest:{FLL:8.5,MCO:8.8}, dom:true},
  {n:'GOL', q:6.0, base:820, pre:'BSB', dest:{MIA:7.5,MCO:7.8}, dom:true},
  {n:'Copa Airlines', q:6.9, base:780, pre:'GRU', via:['PTY',7.0,2.0], dest:{MIA:2.8,MCO:3.0,FLL:2.9,TPA:3.1,JFK:5.2,BOS:5.5,IAD:4.8,ORD:5.7,LAX:6.5,SFO:7.2,LAS:6.3,DEN:5.5}, dom:true}
 ],
 CAN:[
  {n:'Air Canada', q:7.9, base:1150, pre:'GRU', dest:{YYZ:10.5,YUL:10.3}, dom:true},
  {n:'Copa Airlines', q:6.9, base:980, pre:'GRU', via:['PTY',7.0,2.0], dest:{YYZ:5.2,YUL:5.5}, dom:true},
  {n:'American Airlines', q:6.4, base:1080, pre:'GRU', via:['MIA',8.5,2.5,'us'], dest:{YYZ:3.2,YUL:3.5,YVR:6.5,YYC:5.5}, dom:true},
  {n:'United', q:6.6, base:1060, pre:'GRU', via:['EWR',10,2.5,'us'], dest:{YYZ:1.6,YUL:1.5,YVR:6.0,YYC:5.0,YHZ:2.0}, dom:true},
  {n:'Delta', q:7.4, base:1120, pre:'GRU', via:['ATL',9.5,2.5,'us'], dest:{YYZ:2.2,YUL:2.5,YVR:6.0,YYC:5.0}, dom:true}
 ],
 MEX:[
  {n:'Aeroméxico', q:6.9, base:820, pre:'GRU', dest:{MEX:9.5,CUN:8.6}, dom:true},
  {n:'LATAM', q:7.1, base:860, pre:'GRU', dest:{CUN:8.3}, dom:false},
  {n:'GOL', q:6.0, base:760, pre:'BSB', dest:{CUN:7.0}, dom:false},
  {n:'Copa Airlines', q:6.9, base:720, pre:'GRU', via:['PTY',7.0,2.0], dest:{MEX:3.3,CUN:2.2,GDL:4.3,MTY:4.5}, dom:true},
  {n:'Avianca', q:6.2, base:740, pre:'GRU', via:['BOG',6.3,2.2], dest:{MEX:4.6,CUN:3.6}, dom:true}
 ],
 JPN:[  // não há voo direto Brasil–Japão: conexão no Oriente Médio, na Europa ou nos EUA
  {n:'Qatar Airways', q:9.4, base:1750, pre:'GRU', via:['DOH',14.3,2.5], dest:{HND:10.5,NRT:10.5,KIX:10}, dom:true},
  {n:'Emirates', q:8.8, base:1700, pre:'GRU', via:['DXB',14.5,2.5], dest:{HND:9.8,NRT:9.8,KIX:9.5}, dom:true},
  {n:'Turkish Airlines', q:8.7, base:1550, pre:'GRU', via:['IST',12.5,2.5], dest:{HND:12,NRT:12,KIX:12}, dom:true},
  {n:'Air France', q:8.3, base:1650, pre:'GRU', via:['CDG',11.5,2.5], dest:{HND:13.5,KIX:13}, dom:true},
  {n:'Lufthansa', q:7.8, base:1650, pre:'GRU', via:['FRA',11.5,2.5], dest:{HND:13}, dom:true},
  {n:'American Airlines', q:6.4, base:1600, pre:'GRU', via:['DFW',10.2,2.5,'us'], dest:{HND:13.5,NRT:13.5}, dom:true},
  {n:'United', q:6.6, base:1580, pre:'GRU', via:['EWR',10,2.5,'us'], dest:{NRT:14}, dom:true},
  {n:'Delta', q:7.4, base:1650, pre:'GRU', via:['ATL',9.5,2.5,'us'], dest:{HND:14}, dom:true},
  {n:'Ethiopian', q:6.0, base:1450, pre:'GRU', via:['ADD',13.0,2.5], dest:{NRT:16.5}, dom:true}
 ],
 CHN:[
  {n:'Air China', q:6.3, base:1350, pre:'GRU', via:['MAD',10.3,1.5,'same'], dest:{PEK:11.0}, dom:true},
  {n:'Qatar Airways', q:9.4, base:1700, pre:'GRU', via:['DOH',14.3,2.5], dest:{PEK:7.5,PVG:8.5,CAN:7.8,HGH:8.3,TFU:6.8,HKG:8.3}, dom:true},
  {n:'Emirates', q:8.8, base:1650, pre:'GRU', via:['DXB',14.5,2.5], dest:{PEK:7.5,PVG:8.5,CAN:7.5,HKG:8.0}, dom:true},
  {n:'Turkish Airlines', q:8.7, base:1500, pre:'GRU', via:['IST',12.5,2.5], dest:{PEK:9.0,PVG:10.0,CAN:10.5,HKG:10.5}, dom:true},
  {n:'Ethiopian', q:6.0, base:1250, pre:'GRU', via:['ADD',13.0,2.5], dest:{PEK:11,PVG:11.5,CAN:11,TFU:10.5,HKG:11}, dom:true},
  {n:'Air France', q:8.3, base:1600, pre:'GRU', via:['CDG',11.5,2.5], dest:{PEK:10.5,PVG:12}, dom:true}
 ]
};

/* Companhias por código IATA (usado com os preços reais): nome e nota de qualidade 0–10
   (estimativa baseada no ranking Skytrax 2026 e em avaliações de passageiros) */
const AIRLINE_INFO = {
  LA:{n:'LATAM',q:7.1}, JJ:{n:'LATAM',q:7.1}, G3:{n:'GOL',q:6.4}, AD:{n:'Azul',q:7.3},
  AA:{n:'American Airlines',q:6.4}, UA:{n:'United',q:6.6}, DL:{n:'Delta',q:7.4}, B6:{n:'JetBlue',q:6.8},
  AS:{n:'Alaska Airlines',q:6.9}, WN:{n:'Southwest',q:6.5}, NK:{n:'Spirit',q:4.8}, F9:{n:'Frontier',q:4.9},
  CM:{n:'Copa Airlines',q:6.9}, AV:{n:'Avianca',q:6.2}, AR:{n:'Aerolíneas Argentinas',q:6.0}, H2:{n:'Sky Airline',q:5.6}, JA:{n:'JetSMART',q:5.2},
  AM:{n:'Aeroméxico',q:6.9}, Y4:{n:'Volaris',q:5.4}, VB:{n:'Viva Aerobus',q:5.3},
  AC:{n:'Air Canada',q:7.9}, WS:{n:'WestJet',q:6.8}, TS:{n:'Air Transat',q:6.6}, PD:{n:'Porter',q:7.0},
  CA:{n:'Air China',q:6.3}, MU:{n:'China Eastern',q:6.4}, CZ:{n:'China Southern',q:6.5}, HU:{n:'Hainan Airlines',q:8.2}, CX:{n:'Cathay Pacific',q:9.0},
  QR:{n:'Qatar Airways',q:9.4}, EK:{n:'Emirates',q:8.8}, TK:{n:'Turkish Airlines',q:8.7}, ET:{n:'Ethiopian',q:6.0},
  AF:{n:'Air France',q:8.3}, KL:{n:'KLM',q:7.6}, LH:{n:'Lufthansa',q:7.8}, LX:{n:'Swiss',q:7.7}, IB:{n:'Iberia',q:7.6},
  UX:{n:'Air Europa',q:6.3}, TP:{n:'TAP Air Portugal',q:6.2}, BA:{n:'British Airways',q:7.2}, VS:{n:'Virgin Atlantic',q:7.7},
  SQ:{n:'Singapore Airlines',q:9.6}, KE:{n:'Korean Air',q:8.4}, NH:{n:'ANA',q:9.0}, JL:{n:'Japan Airlines',q:8.6}, AT:{n:'Royal Air Maroc',q:5.8}
};

/* Configuração do site */
const CONFIG = {
  origin:'GRU',                 // saída padrão quando não dá para saber onde a pessoa está
  // aeroportos de saída que a pessoa pode escolher (capitais); o mais perto dela é escolhido sozinho
  origins:['RBR','MCZ','MCP','MAO','SSA','FOR','BSB','VIX','GYN','SLZ','CGB','CGR','CNF','BEL','JPA','CWB','REC','THE','GIG','NAT','POA','PVH','BVB','FLN','GRU','AJU','PMW'],
  // localização aproximada pelo IP (sem pedir permissão); deixe '' para desativar
  ipGeoUrl:'https://get.geojs.io/v1/ip/geo.json',
  flightsDir:'data/flights/',   // um arquivo de voos por aeroporto de saída (gerado pelo coletor)
  pricesUrl:'data/prices.json', // arquivo gerado pelo coletor diário
  defaultUsdBrl:5.20            // usado só se o arquivo de preços ainda não tiver o câmbio do dia
};

return {COUNTRIES, PROF, R, HOL, PRESETS, holidaysFor, AP, GW, GW_DEFAULT, PRE, AIRLINES, AIRLINE_INFO, CONFIG};
})();
