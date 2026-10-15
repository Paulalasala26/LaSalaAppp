'use strict';
/* Captura cuantitativa operativa: separada de la escritura histórica y sin cola offline ficticia. */
(function(){
  const API='/api/admin-qc-mediciones';
  const AUTH='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const CATS=[
    ['color','Color',[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]],
    ['tamano','Tamaño',[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]],
    ['sanidad','Sanidad',[['ok','OK'],['enferma','Enferma']]],
    ['flores','Flores',[['si','Sí'],['no','No']]],
    ['raices','Raíces',[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK']]]
  ];
  let active=null,sequence=0,writing=false,version=0,record=null,original='';
  const node=(tag,txt,cls)=>{
    const n=document.createElement(tag);
    if(txt!==null&&txt!==undefined)n.textContent=String(txt);
    if(cls)n.className=cls;
    return n;
  };
  function report(msg,type){
    const box=active?.querySelector('.qco-feedback');
    if(!box)return;
    box.hidden=!msg;box.className='qco-feedback'+(type?' '+type:'');
    box.textContent=msg||'';
  }
  function strCount(value){
    const text=String(value??'').trim();
    if(!/^\d+$/.test(text))return null;
    const n=Number(text);
    return Number.isSafeInteger(n)&&n>=1&&n<=10000000?n:null;
  }
  function snapshot(){
    if(!active)return null;
    const out={bandejasInspeccionadas:active.querySelector('.qco-total input').value,mediciones:{}};
    for(const [category,unused,options] of CATS){
      out.mediciones[category]={};
      const wrap=active.querySelector('[data-qco-cat="'+category+'"]');
      for(const [opt] of options){
        const row=Array.from(wrap.querySelectorAll('.qco-option')).find(x=>x.dataset.option===opt);
        if(row.querySelector('input[type="checkbox"]').checked)out.mediciones[category][opt]=row.querySelector('input[type="number"]').value;
      }
    }
    return out;
  }
  function changed(){return original!==JSON.stringify(snapshot())}
  function close(){
    if(writing)return;
    if(active&&changed()&&!confirm('Hay mediciones sin guardar. ¿Salir sin guardar?'))return;
    const previous=active;sequence++;active=null;record=null;original='';
    if(previous)previous.remove();
  }
  async function token(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH)||'null')}catch(e){}
    if(!saved?.user||!saved.refreshToken)throw Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw Error('LOGIN_REQUIRED');
    const v=await r.json();
    if(!v.id_token||!v.refresh_token)throw Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH,JSON.stringify({user:saved.user,refreshToken:v.refresh_token}));
    return v.id_token;
  }
  function populate(saved){
    version=saved?.version||0;
    active.querySelector('.qco-total input').value=saved?String(saved.bandejasInspeccionadas):'';
    for(const [category,unused,options] of CATS){
      const wrap=active.querySelector('[data-qco-cat="'+category+'"]');
      for(const [opt] of options){
        const row=Array.from(wrap.querySelectorAll('.qco-option')).find(x=>x.dataset.option===opt);
        const n=saved?.mediciones?.[category]?.[opt];
        const cb=row.querySelector('input[type="checkbox"]'),quantity=row.querySelector('input[type="number"]');
        cb.checked=Number.isInteger(n)&&n>0;quantity.disabled=!cb.checked;
        quantity.required=cb.checked;quantity.value=cb.checked?String(n):'';
      }
    }
    original=JSON.stringify(snapshot());
    report(saved?'Mediciones recuperadas (versión '+version+'). Puedes actualizarlas.':
      'Esta línea aún no tiene cantidades cuantificadas. Marca cada característica observada y escribe sus bandejas.','');
  }
  function validate(){
    const v=snapshot(),total=strCount(v.bandejasInspeccionadas),errors=[],clean={};
    if(total===null)errors.push('Indica cuántas bandejas se han inspeccionado (entero positivo).');
    for(const [cat,name] of CATS){
      const opts=v.mediciones[cat];clean[cat]={};
      if(!Object.keys(opts).length)errors.push(name+': marca al menos una opción.');
      for(const [key,str] of Object.entries(opts)){
        const qty=strCount(str);
        if(qty===null||total!==null&&qty>total)
          errors.push(name+' / '+key+': indica una cantidad positiva que no supere las inspeccionadas.');
        else clean[cat][key]=qty;
      }
    }
    return {errors,total,mediciones:clean};
  }
  async function save(e){
    e.preventDefault();
    if(!active||!record||writing)return;
    const checked=validate();
    if(checked.errors.length){report('No se puede guardar: '+checked.errors.slice(0,7).join(' · '),'error');return;}
    if(navigator.onLine===false){
      report('Sin conexión. Las cantidades no se han guardado; vuelve a intentarlo al recuperar la conexión.','error');return;
    }
    writing=true;
    const btn=active.querySelector('.qco-save');btn.disabled=true;
    report('Guardando cantidades…','');
    try{
      const jwt=await token();
      const r=await fetch(API,{
        method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
        body:JSON.stringify({
          id:record.id,tipo:record.tipo,dia:record.dia,partida:record.partida,
          version,bandejasInspeccionadas:checked.total,mediciones:checked.mediciones
        }),cache:'no-store'
      });
      if(r.status===403)throw Error('FORBIDDEN');
      if(r.status===409)throw Error('CONFLICT');
      if(!r.ok)throw Error('SAVE_FAILED');
      const data=await r.json();
      if(!data.ok||!Number.isInteger(data.version))throw Error('SAVE_FAILED');
      version=data.version;original=JSON.stringify(snapshot());
      report('✓ Cantidades guardadas y confirmadas (versión '+version+'). Los checks anteriores no se han modificado.','success');
    }catch(err){
      report(err.message==='CONFLICT'?
        'Otro usuario ha modificado esta medición o la partida. No se han sobrescrito sus datos. Cierra y vuelve a abrir para consultar la versión actual.':
        err.message==='FORBIDDEN'?'Tu perfil no tiene permiso para medir este estadio.':
        'No se ha podido confirmar el guardado. No vuelvas a enviar sin revisar primero los datos.','error');
    }finally{
      writing=false;if(active)btn.disabled=false;
    }
  }
  function build(rec){
    const overlay=node('div',null,'qco-overlay');overlay.id='qco-overlay';
    const dialog=node('div',null,'qco-dialog');
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-label','Medición de calidad por bandejas');
    const head=node('div',null,'qco-header');
    const heading=node('div','Medir calidad por bandejas','qco-title');
    const exit=node('button','×','qco-close');exit.type='button';exit.title='Cerrar';
    exit.setAttribute('aria-label','Cerrar');exit.addEventListener('click',close);
    head.append(heading,exit);dialog.append(head);
    const body=node('div',null,'qco-body');
    const meta=node('div',null,'qco-meta');
    for(const val of [rec.tipo==='tunel'?'Túnel':'Carga',
      'Partida: '+(rec.partida||'—'),'Bandejas informadas: '+(rec.numBandejas||'—')])
      meta.append(node('span',val,'qco-chip'));
    body.append(meta);
    body.append(node('p','Registra cuántas bandejas presentan cada característica. Las cantidades no se deducen de los checks históricos y no se suman entre categorías.','qco-info'));
    const legacy=node('div',null,'qco-legacy');
    legacy.append(node('strong','Checks anteriores (solo referencia): '));
    const descriptions=[];
    for(const [key,name,opts] of CATS){
      const marks=opts.filter(([o])=>rec[key]?.[o]===true).map(([,title])=>title);
      if(marks.length)descriptions.push(name+': '+marks.join(', '));
    }
    legacy.append(node('span',descriptions.join(' · ')||'Sin respuestas marcadas'));
    body.append(legacy);
    const form=node('form');form.noValidate=true;form.addEventListener('submit',save);
    const total=node('label',null,'qco-total');
    const totalTitle=node('span','Nº bandejas inspeccionadas *');
    const qtyInput=node('input');qtyInput.type='number';qtyInput.inputMode='numeric';
    qtyInput.min='1';qtyInput.max='10000000';qtyInput.step='1';qtyInput.placeholder='Ej.: 80';qtyInput.required=true;
    total.append(totalTitle,qtyInput);form.append(total);
    for(const [category,name,opts] of CATS){
      const wrap=node('fieldset',null,'qco-cat');wrap.dataset.qcoCat=category;
      wrap.append(node('legend',name));
      for(const [option,label] of opts){
        const row=node('div',null,'qco-option');row.dataset.option=option;
        const checkLabel=node('label'),cb=node('input');
        cb.type='checkbox';checkLabel.append(cb,node('span',label));
        const input=node('input');input.type='number';input.step='1';input.min='1';
        input.max='10000000';input.inputMode='numeric';input.placeholder='Bandejas';
        input.setAttribute('aria-label',name+' · '+label+' · número de bandejas');
        input.disabled=true;
        cb.addEventListener('change',()=>{
          input.disabled=!cb.checked;input.required=cb.checked;
          if(!cb.checked)input.value='';if(cb.checked)input.focus();
          report('','');
        });
        row.append(checkLabel,input);wrap.append(row);
      }
      form.append(wrap);
    }
    const feedback=node('div','Cargando las cantidades…','qco-feedback');
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    form.append(feedback);
    const foot=node('div',null,'qco-footer');
    const cancel=node('button','Cerrar','qco-secondary');cancel.type='button';
    cancel.addEventListener('click',close);
    const submit=node('button','Guardar cantidades','qco-save');submit.type='submit';submit.disabled=true;
    foot.append(cancel,submit);form.append(foot);
    body.append(form);dialog.append(body);overlay.append(dialog);
    return overlay;
  }
  async function open(rec){
    if(!rec||!['tunel','carga'].includes(rec.tipo)||typeof rec.id!=='string'||
      !/^[A-Za-z0-9_-]{1,180}$/.test(rec.id)||!
      Number.isInteger(rec.dia)||rec.dia<15||rec.dia>4000||
      typeof rec.partida!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(rec.partida)){
      alert('Este control no tiene todos los identificadores necesarios para cuantificarlo.');
      return;
    }
    if(active)close();
    if(active)return;
    const thisSequence=++sequence;
    record={id:rec.id,tipo:rec.tipo,dia:rec.dia,partida:rec.partida};
    active=build(rec);document.body.append(active);
    const modal=active;
    modal.querySelector('.qco-close').focus();
    try{
      const jwt=await token();
      const q=new URLSearchParams({id:rec.id,tipo:rec.tipo,dia:String(rec.dia)});
      const response=await fetch(API+'?'+q.toString(),{
        method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(response.status===403)throw Error('FORBIDDEN');
      if(response.status===409)throw Error('CONFLICT');
      if(!response.ok)throw Error('LOAD_FAILED');
      const data=await response.json();
      if(!data.ok||data.sourcePartida!==rec.partida)throw Error('CONFLICT');
      if(sequence!==thisSequence||active!==modal)return;
      populate(data.record);
      modal.querySelector('.qco-save').disabled=false;
    }catch(err){
      if(sequence!==thisSequence||active!==modal)return;
      report(err.message==='FORBIDDEN'?'No tienes permiso para cuantificar este control.':
        err.message==='CONFLICT'?'La partida ha cambiado: vuelve a cargar el control.':
        'No se han podido recuperar las cantidades. El guardado está desactivado para evitar sobrescribir información.','error');
    }
  }
  window.QCOperativo=Object.freeze({open});
})();
