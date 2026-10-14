'use strict';
/* QC unificado: prototipo de evaluación cuantitativa, exclusivamente lectura TEST y validación local. */
(function(){
  const AUTH_KEY='lasala-firebase-auth-v1';
  const TRANSFER_KEY='lasala-qc-prototipo-ref-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const TEST_DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
  const CATS=[
    {key:'color',name:'Color',options:[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]},
    {key:'tamano',name:'Tamaño',options:[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]},
    {key:'sanidad',name:'Sanidad',options:[['ok','OK'],['enferma','Enferma']]},
    {key:'flores',name:'Flores',options:[['si','Sí'],['no','No']]},
    {key:'raices',name:'Raíces',options:[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK']]}
  ];
  const ILLNESSES={
    hojasManchadas:'Hojas manchadas',hojasAmarillas:'Hojas amarillas',
    tuta:'Tuta',minador:'Minador',pulgon:'Pulgón',oidio:'Oídio',
    alternaria:'Alternaria',botritis:'Botritis'
  };
  const el=id=>document.getElementById(id);
  const labelDate=d=>{
    const START=Date.UTC(2026,5,15);
    return new Date(START+(d-15)*86400000).toLocaleDateString('es-ES',{timeZone:'UTC'});
  };
  const asString=value=>value===undefined||value===null?'':String(value);
  const node=(tag,txt,cls)=>{
    const x=document.createElement(tag);
    if(txt!==undefined&&txt!==null)x.textContent=asString(txt);
    if(cls)x.className=cls;
    return x;
  };
  function gate(msg){
    el('gate-title').textContent='Acceso restringido';
    el('gate-description').textContent=msg;
    el('gate-link').hidden=false;
    el('workspace').hidden=true;
    el('access-gate').hidden=false;
  }
  async function getToken(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch(e){}
    if(!saved?.user||!saved?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!response.ok)throw new Error('LOGIN_REQUIRED');
    const auth=await response.json();
    if(!auth.id_token||!auth.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH_KEY,JSON.stringify({user:saved.user,refreshToken:auth.refresh_token}));
    return auth.id_token;
  }
  async function verifyAdmin(jwt){
    const response=await fetch('/api/admin-catalog',{
      headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(response.status===401)throw new Error('LOGIN_REQUIRED');
    if(response.status===403)throw new Error('NO_PERMISSION');
    if(!response.ok)throw new Error('AUTH_ERROR');
    const value=await response.json();
    if(!value||!Array.isArray(value.rooms)||!Array.isArray(value.greenhouses))
      throw new Error('AUTH_ERROR');
    return value.currentUser||'Administrador';
  }
  function getSelection(){
    let selected=null;
    try{selected=JSON.parse(sessionStorage.getItem(TRANSFER_KEY)||'null')}catch(e){}
    if(!selected||!['tunel','carga'].includes(selected.tipo)||
       !Number.isInteger(selected.dia)||selected.dia<15||selected.dia>4000||
       typeof selected.id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(selected.id)||
       !Number.isFinite(selected.ts)||Date.now()-selected.ts>5*60000||selected.ts>Date.now()+60000){
      throw new Error('NO_SELECTION');
    }
    return selected;
  }
  async function getRecord(jwt,selected){
    const q=Math.max(0,Math.floor((selected.dia-15)/14));
    const shard='lasala-control-items-v2-'+selected.tipo+'-q'+q;
    const url=TEST_DB+'/'+encodeURIComponent(shard)+'/'+encodeURIComponent(selected.id)+'.json?auth='+encodeURIComponent(jwt);
    const response=await fetch(url,{method:'GET',cache:'no-store'});
    if(!response.ok)throw new Error('DB_ERROR');
    const value=await response.json();
    const rec=typeof value==='string'?JSON.parse(value):value;
    if(!rec||Array.isArray(rec)||typeof rec!=='object'||rec.id!==selected.id||
       rec.tipo!==selected.tipo||rec.dia!==selected.dia){
      throw new Error('NOT_FOUND');
    }
    return rec;
  }
  function field(parent,key,val){
    const x=node('div',null,'qcu-field');
    x.append(node('span',key),node('strong',val===''?'—':val));
    parent.append(x);
  }
  function checked(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return [];
    return Object.keys(obj).filter(k=>obj[k]===true);
  }
  function renderIdentity(r){
    const root=el('qcu-fields');root.replaceChildren();
    const tipo=r.tipo==='tunel'?'Túnel':'Carga';
    field(root,'Partida',r.partida||'—');
    field(root,'Estadio',tipo);
    field(root,'Fecha de control',labelDate(r.dia));
    field(root,'Nº bandejas informadas (heredado)',r.numBandejas||'—');
    field(root,'Cliente / Variedad',r.tipo==='tunel'?(r.clienteVariedad||'—'):
      [r.cliente,r.variedad].filter(Boolean).join(' · ')||'—');
    field(root,'Ubicación',r.tipo==='tunel'?
      ('INV '+asString(r.invId||'—')+(r.calleDesde!=null?' · C/ '+r.calleDesde+(r.calleHasta!=null&&r.calleHasta!==r.calleDesde?'–'+r.calleHasta:''):''))
      :(asString(r.invernadero||'No informada')));
    field(root,'Registro histórico (ID)',r.id);
    field(root,'Creado por',r.creadoPor||'—');
    if(r.fentrega)field(root,'Fecha prevista/entrega heredada',r.fentrega);
  }
  function legacyBlock(label,txt){
    const box=node('div',null,'qcu-legacy');
    box.append(node('b',label),node('p',txt||'Sin responder'));return box;
  }
  function renderLegacy(r){
    const root=el('qcu-legacy');root.replaceChildren();
    for(const cat of CATS){
      const names=new Map(cat.options);
      const marked=checked(r[cat.key]).map(x=>names.get(x)||x);
      root.append(legacyBlock(cat.name,marked.length?marked.join(' · '):'Sin responder'));
    }
    const extra=checked(r.sanidadEnfermedades).map(x=>ILLNESSES[x]||x);
    if(extra.length)root.append(legacyBlock('Enfermedades / incidencias',extra.join(' · ')));
    const injerto=checked(r.raicesInjerto);
    if(injerto.length)root.append(legacyBlock('Raíces injerto (histórico)',injerto.join(' · ')));
    if(r.observaciones)root.append(legacyBlock('Observaciones',r.observaciones));
    const otherRootKeys=[
      'raices','color','tamano','sanidad','flores'
    ];
    for(const k of otherRootKeys){
      const known=new Set(CATS.find(x=>x.key===k)?.options.map(x=>x[0])||[]);
      const unknown=checked(r[k]).filter(x=>!known.has(x));
      if(unknown.length)root.append(legacyBlock('Valores adicionales de '+k,unknown.join(' · ')));
    }
  }
  function renderGroups(){
    const root=el('qcu-groups');root.replaceChildren();
    for(const cat of CATS){
      const wrap=node('fieldset',null,'qcu-group');wrap.dataset.cat=cat.key;
      const legend=node('legend',cat.name);
      legend.style.cssText='font-weight:800;font-size:14px;color:#1558a0;padding:0 5px';
      wrap.append(legend);
      const hint=node('p','Marca una o varias opciones e indica la cantidad de bandejas para cada una.','qcu-note');
      wrap.append(hint);
      const list=node('div',null,'qcu-opts');
      for(const [key,name] of cat.options){
        const opt=node('div',null,'qcu-option');
        const label=node('label');
        const checkbox=node('input');checkbox.type='checkbox';checkbox.dataset.cat=cat.key;checkbox.dataset.option=key;
        checkbox.setAttribute('aria-label',cat.name+': '+name);
        label.append(checkbox,node('span',name));
        const quantity=node('input');quantity.type='number';quantity.inputMode='numeric';
        quantity.step='1';quantity.min='1';quantity.disabled=true;
        quantity.dataset.cat=cat.key;quantity.dataset.option=key;
        quantity.placeholder='Nº bandejas';
        quantity.setAttribute('aria-label','Bandejas '+name+' en '+cat.name);
        checkbox.addEventListener('change',()=>{
          quantity.disabled=!checkbox.checked;
          quantity.required=checkbox.checked;
          if(!checkbox.checked)quantity.value='';
          el('qcu-validation').hidden=true;
          if(checkbox.checked)quantity.focus();
        });
        quantity.addEventListener('input',()=>{el('qcu-validation').hidden=true;quantity.removeAttribute('aria-invalid')});
        opt.append(label,quantity);list.append(opt);
      }
      wrap.append(list);root.append(wrap);
    }
  }
  function validInt(value){
    const s=asString(value).trim();
    if(!/^\d+$/.test(s))return null;
    const n=Number(s);return Number.isSafeInteger(n)&&n>0?n:null;
  }
  function validate(){
    const errors=[],entries=[];
    const totalInput=el('qcu-inspected');
    const total=validInt(totalInput.value);
    totalInput.setAttribute('aria-invalid',total===null?'true':'false');
    if(total===null)errors.push('Introduce un número entero mayor que cero de bandejas inspeccionadas.');
    for(const cat of CATS){
      const group=el('qcu-groups').querySelector('[data-cat="'+cat.key+'"].qcu-group');
      const checkboxes=Array.from(group.querySelectorAll('input[type="checkbox"]'));
      const chosen=checkboxes.filter(x=>x.checked);
      if(!chosen.length)errors.push(cat.name+': selecciona al menos una opción.');
      const values=[];
      for(const cb of chosen){
        const input=Array.from(group.querySelectorAll('input[type="number"]'))
          .find(x=>x.dataset.option===cb.dataset.option);
        const count=validInt(input.value);
        const name=cat.options.find(x=>x[0]===cb.dataset.option)?.[1]||cb.dataset.option;
        const valid=count!==null&&(total===null||count<=total);
        input.setAttribute('aria-invalid',valid?'false':'true');
        if(!valid)errors.push(cat.name+' / '+name+': indica entre 1 y '+(total||'el total inspeccionado')+' bandejas.');
        else values.push({opcion:cb.dataset.option,bandejasAfectadas:count});
      }
      entries.push({categoria:cat.key,opciones:values});
    }
    return {ok:errors.length===0,errors,total,entries};
  }
  function submit(e){
    e.preventDefault();
    const res=validate();
    const msg=el('qcu-validation');msg.hidden=false;
    if(res.ok){
      msg.className='qcu-alert ok';
      const total=res.entries.reduce((n,g)=>n+g.opciones.length,0);
      msg.textContent='✓ Formulario válido: '+res.total+' bandejas inspeccionadas y '+total+
        ' opciones cuantificadas. Validación LOCAL: no se ha guardado nada. No se calcula aún porcentaje QC porque faltan reglas y control de solapes.';
    }else{
      msg.className='qcu-alert error';
      msg.textContent='No se puede finalizar: '+res.errors.slice(0,8).join(' · ')+
        (res.errors.length>8?' · Y '+(res.errors.length-8)+' errores más.':'')+
        ' Ningún dato se ha guardado.';
    }
  }
  async function start(){
    el('qcu-form').addEventListener('submit',submit);
    el('qcu-inspected').addEventListener('input',()=>{el('qcu-validation').hidden=true});
    try{
      const selected=getSelection();
      const jwt=await getToken();
      const username=await verifyAdmin(jwt);
      const rec=await getRecord(jwt,selected);
      renderIdentity(rec);renderLegacy(rec);renderGroups();
      el('session-user').textContent=username;
      el('workspace').hidden=false;
      el('access-gate').hidden=true;
    }catch(e){
      const msg=e?.message==='NO_SELECTION'?'Selecciona primero un registro desde Backoffice → QC.':
        e?.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP para continuar.':
        e?.message==='NO_PERMISSION'?'Se necesita el rol ADMIN activo.':
        e?.message==='NOT_FOUND'?'El registro ha cambiado o no se encuentra en los segmentos QC de TEST.':
        'No se ha podido cargar la ficha QC en TEST.';
      console.warn('QC prototipo no disponible:',e?.message);
      gate(msg);
    }
  }
  start();
})();
