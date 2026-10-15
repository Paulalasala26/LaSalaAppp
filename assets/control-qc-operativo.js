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
  CATS.forEach(cat=>cat[2].push(['noEvaluada','No evaluada']));
  function categoryIssue(category,values,total){
    const notEvaluated=values.noEvaluada||0;
    if(category!=='raices'){
      const sum=Object.values(values).reduce((a,b)=>a+b,0);
      if(sum!==total)return sum<total?'Faltan '+(total-sum)+' bandejas.':'Sobran '+(sum-total)+' bandejas.';
      return '';
    }
    // Los dos defectos de raíces pueden coexistir en una bandeja.
    // OK y No evaluada no se solapan con bandejas defectuosas.
    const evaluated=total-notEvaluated,ok=values.ok||0;
    if(ok>evaluated)return 'OK supera las evaluadas en '+(ok-evaluated)+' bandejas.';
    const affected=evaluated-ok;
    const low=values.pocaRaiz||0,inVariety=values.raizVariedad||0;
    const minimum=Math.max(low,inVariety),maximum=low+inVariety;
    if(affected<minimum)return 'Sobran '+(minimum-affected)+' bandejas con defectos respecto a las evaluadas.';
    if(affected>maximum)return 'Faltan '+(affected-maximum)+' bandejas por clasificar.';
    return '';
  }
  let active=null,sequence=0,writing=false,version=0,record=null,original='';
  let savedMeasurement=null,currentRules=null,observer=null,loading=false;
  function controlButton(){
    const root=document.getElementById('control-overlay');
    if(!root||!record)return null;
    const expected="abrirMedicionesControl('"+record.id+"')";
    const anchor=Array.from(root.querySelectorAll('[data-qco-anchor]'))
      .find(a=>a.dataset.qcoAnchor===record.id);
    return anchor||Array.from(root.querySelectorAll('button[onclick]'))
      .find(b=>b.getAttribute('onclick')===expected)||null;
  }
  // Mantener una sola presentación de las opciones en las tarjetas clásicas.
  // Los inputs visibles son un reflejo de la medición, no modifican los checks
  // históricos ni generan operaciones de escritura independientes.
  function embedAmounts(){
    if(!active||!record)return;
    const card=controlButton()?.closest('[id^="control-card-"]');
    if(!card||card.id!=='control-card-'+record.id){
      active.classList.remove('qco-merged');
      return; // Ginés mantiene el formulario cuantitativo en su paso final.
    }
    const originalButtons=Array.from(card.querySelectorAll('button[onclick]'));
    const matches=[];
    for(const button of originalButtons){
      const call=button.getAttribute('onclick')||'';
      const parts=/^toggleControlCheckOpcion\('([A-Za-z0-9_-]+)','(color|tamano|sanidad|flores|raices)','([A-Za-z0-9]+)'\)$/.exec(call);
      if(!parts||parts[1]!==record.id)continue;
      const group=CATS.find(x=>x[0]===parts[2]);
      if(!group||!group[2].some(x=>x[0]===parts[3]))continue;
      matches.push({button,category:parts[2],option:parts[3],name:group[1]});
    }
    // Solo fusionar si el check estándar expone todas sus opciones.
    const expected=CATS.reduce((n,x)=>n+x[2].length-1,0);
    if(matches.length!==expected){
      active.classList.remove('qco-merged');
      return;
    }
    card.querySelectorAll('.qco-live-control, .qco-live-slot').forEach(x=>x.remove());
    const containers=new Map();
    const addInput=(container,category,option,name,label)=>{
      const original=active.querySelector('[data-qco-cat="'+category+'"] .qco-option[data-option="'+option+'"] input[type="number"]');
      if(!original)return;
      const shell=node('label',null,'qco-live-control');
      shell.dataset.qcCategory=category;
      shell.dataset.qcOption=option;
      if(label)shell.append(node('span',label));
      const proxy=node('input');
      proxy.type='number';proxy.min='1';proxy.step='1';proxy.max='10000000';
      proxy.inputMode='numeric';proxy.placeholder='—';
      proxy.value=original.value;proxy.disabled=loading||writing;
      const text=label||CATS.find(x=>x[0]===category)?.[2].find(x=>x[0]===option)?.[1]||option;
      proxy.setAttribute('aria-label',name+' · '+text+' · bandejas');
      proxy.addEventListener('input',()=>{
        original.value=proxy.value;
        updateIndicatorVisibility();
        report('','');
      });
      shell.append(proxy);
      container.append(shell);
    };
    for(const entry of matches){
      const {button,category,option,name}=entry;
      const parent=button.parentElement;
      if(!containers.has(category))containers.set(category,parent);
      const slot=node('span',null,'qco-live-slot');
      button.insertAdjacentElement('afterend',slot);
      addInput(slot,category,option,name,'');
    }
    for(const [category,name] of CATS){
      const parent=containers.get(category);
      if(parent){
        addInput(parent,category,'noEvaluada',name,'No evaluada');
        const badge=node('span',null,'qco-live-balance');
        badge.dataset.qcoBalance=category;badge.hidden=true;
        parent.append(badge);
      }
    }
    active.classList.add('qco-merged');
    syncInlineIndicators();
    renderBalances();
  }
  function mount(){
    if(!active)return;
    const button=controlButton();
    if(button){
      active.classList.remove('qco-floating');
      if(button.hasAttribute('data-qco-anchor'))button.insertAdjacentElement('afterend',active);
      else button.parentElement.insertAdjacentElement('afterend',active);
      if(button.tagName==='BUTTON')button.setAttribute('aria-expanded','true');
      embedAmounts();
    }else if(loading||writing||changed()){
      active.classList.remove('qco-merged');
      active.classList.add('qco-floating');
      document.body.append(active);
    }else close(true);
  }
  function observeControl(){
    if(observer)observer.disconnect();
    const root=document.getElementById('control-overlay');
    if(!root)return;
    observer=new MutationObserver(()=>{
      if(active&&(!active.isConnected||(active.classList.contains('qco-floating')&&controlButton())))mount();
    });
    observer.observe(root,{childList:true,subtree:true});
  }
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
        const value=row.querySelector('input[type="number"]').value.trim();
        if(value!=='')out.mediciones[category][opt]=value;
      }
    }
    return out;
  }
  function changed(){return original!==JSON.stringify(snapshot())}
  function close(force=false){
    if(writing)return;
    if(!force&&active&&changed()&&!confirm('Hay mediciones sin guardar. ¿Salir sin guardar?'))return;
    const previous=active,button=controlButton();
    sequence++;active=null;record=null;original='';loading=false;
    savedMeasurement=null;currentRules=null;
    if(observer){observer.disconnect();observer=null;}
    if(button)button.setAttribute('aria-expanded','false');
    document.querySelectorAll('#control-overlay .qco-live-control, #control-overlay .qco-live-slot').forEach(x=>x.remove());
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
        const quantity=row.querySelector('input[type="number"]');
        quantity.value=Number.isInteger(n)&&n>0?String(n):'';
      }
    }
    original=JSON.stringify(snapshot());
    savedMeasurement=saved;
    // Nunca permitir la captura antes de terminar de recuperar los datos.
    active.querySelectorAll('.qco-total input, .qco-cat input[type="number"]')
      .forEach(input=>{input.disabled=false;});
    loading=false;
    embedAmounts();
    updateIndicatorVisibility();
    report('','');
  }
  async function fetchRules(jwt,stage){
    const response=await fetch('/api/admin-qc-reglas?stage='+encodeURIComponent(stage),{
      method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(!response.ok)throw Error('RULES_UNAVAILABLE');
    const data=await response.json();
    if(!data.ok||data.stage!==stage||!data.rules?.criterios)throw Error('RULES_UNAVAILABLE');
    return data.rules;
  }
  function renderBalances(){
    if(!active)return;
    const raw=snapshot(),total=strCount(raw.bandejasInspeccionadas);
    for(const [category] of CATS){
      const targets=Array.from(active.querySelectorAll('[data-qco-cat="'+category+'"] .qco-balance'))
        .concat(Array.from(document.querySelectorAll('#control-overlay [data-qco-balance="'+category+'"]')));
      const values=raw.mediciones[category];
      let label='',invalid=false;
      if(Object.keys(values).length){
        if(total===null){label='Indica el total';invalid=true;}
        else{
          const parsed={};
          for(const [key,value] of Object.entries(values)){
            const n=strCount(value);
            if(n===null||n>total){invalid=true;break;}
            parsed[key]=n;
          }
          if(invalid)label='Cantidad inválida';
          else{
            const issue=categoryIssue(category,parsed,total);
            invalid=!!issue;
            if(category==='raices')label=issue||'✓ Cuadra';
            else{
              const sum=Object.values(parsed).reduce((a,b)=>a+b,0);
              label=sum.toLocaleString('es-ES')+' / '+total.toLocaleString('es-ES')+
                (issue?' · '+issue.replace(' bandejas.',''):' ✓');
            }
          }
        }
      }
      for(const target of targets){
        target.hidden=!label;target.textContent=label;
        target.classList.toggle('is-warning',invalid);
      }
    }
  }
  function updateIndicatorVisibility(){
    renderBalances();
    const isSaved=!!savedMeasurement&&!changed();
    const details=active?.querySelector('.qco-indicators');
    if(details)details.hidden=!isSaved;
    document.querySelectorAll('#control-overlay .qco-live-indicator').forEach(el=>el.hidden=!isSaved);
  }
  function syncInlineIndicators(){
    const controls=Array.from(document.querySelectorAll('#control-overlay .qco-live-control'));
    controls.forEach(el=>el.querySelector('.qco-live-indicator')?.remove());
    if(!active?.classList.contains('qco-merged')||!savedMeasurement||changed()||!window.QCIndicators)return;
    const result=window.QCIndicators.evaluate(savedMeasurement,currentRules);
    if(!result.available)return;
    for(const entry of result.rows){
      const shell=controls.find(x=>x.dataset.qcCategory===entry.category&&x.dataset.qcOption===entry.option);
      if(!shell)continue;
      const suffix=entry.level==='critical'?' !':entry.level==='warning'?' *':'';
      const badge=node('span',Number(entry.percentDisplay).toLocaleString('es-ES',{maximumFractionDigits:2})+' %'+suffix,
        'qco-live-indicator '+entry.level);
      badge.title=entry.description;
      shell.append(badge);
    }
  }
  function renderIndicators(expand){
    const details=active?.querySelector('.qco-indicators');
    if(!details)return;
    details.hidden=true;
    if(!savedMeasurement||!window.QCIndicators)return;
    const v=window.QCIndicators.evaluate(savedMeasurement,currentRules);
    if(!v.available)return;
    const summary=details.querySelector('summary'),list=details.querySelector('.qco-indicator-list');
    summary.textContent='Indicadores guardados';
    if(v.configuredCount){
      const flags=[];
      if(v.warningCount)flags.push(v.warningCount+' aviso'+(v.warningCount===1?'':'s'));
      if(v.criticalCount)flags.push(v.criticalCount+' alerta'+(v.criticalCount===1?'':'s'));
      if(flags.length)summary.textContent+=' · '+flags.join(' · ');
    }
    list.replaceChildren();
    const header=node('div',null,'qco-indicator-row qco-indicator-head');
    header.append(node('span','Característica'),node('span','Bandejas'),node('span','% / Alerta'));
    list.append(header);
    for(const entry of v.rows){
      const line=node('div',null,'qco-indicator-row');
      const value=Number(entry.percentDisplay).toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
      const alertText=entry.level==='critical'?' · Prioritaria':
        entry.level==='warning'?' · Aviso':'';
      line.append(
        node('span',entry.categoryLabel+' · '+entry.optionLabel),
        node('span',entry.count.toLocaleString('es-ES')+' / '+v.inspected.toLocaleString('es-ES')),
        node('span',value+alertText,'qco-indicator-value '+entry.level)
      );
      if(entry.tolerance!==null&&(entry.treatment==='incidencia'||entry.treatment==='critico'))
        line.title='Tolerancia '+entry.tolerance.toLocaleString('es-ES',{maximumFractionDigits:2})+' %';
      list.append(line);
    }
    details.hidden=false;
    if(expand)details.open=true;
    syncInlineIndicators();
    updateIndicatorVisibility();
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
      if(total!==null&&Object.keys(clean[cat]).length===Object.keys(opts).length){
        const issue=categoryIssue(cat,clean[cat],total);if(issue)errors.push(name+': '+issue);
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
      report('Sin conexión. No guardado.','error');return;
    }
    writing=true;
    // Los campos quedan congelados hasta confirmar la escritura.
    active.querySelectorAll('.qco-total input, .qco-cat input[type="number"]')
      .forEach(input=>{input.disabled=true;});
    active.querySelectorAll('.qco-live-control input').forEach(x=>x.disabled=true);
    document.querySelectorAll('#control-overlay .qco-live-control input').forEach(x=>x.disabled=true);
    const btn=active.querySelector('.qco-save');btn.disabled=true;
    report('Guardando…','');
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
      savedMeasurement={version,bandejasInspeccionadas:checked.total,mediciones:checked.mediciones};
      renderIndicators(true);
      report('✓ Guardado','success');
      const completedModal=active;
      setTimeout(()=>{
        if(active===completedModal&&active?.querySelector('.qco-feedback')?.classList.contains('success'))report('','');
      },2500);
    }catch(err){
      report(err.message==='CONFLICT'?
        'Conflicto: datos modificados. Cierra y vuelve a abrir.':
        err.message==='FORBIDDEN'?'Sin permiso para este estadio.':
        'Guardado sin confirmar. Reabre para comprobar antes de repetir.','error');
    }finally{
      writing=false;
      if(active){
        btn.disabled=false;
        active.querySelectorAll('.qco-total input, .qco-cat input[type="number"]')
          .forEach(input=>{input.disabled=false;});
        embedAmounts();
      }
    }
  }
  function build(rec){
    const overlay=node('section',null,'qco-inline');overlay.id='qco-inline';
    const dialog=node('div',null,'qco-dialog');
    dialog.setAttribute('role','region');
    dialog.setAttribute('aria-label','Cantidades e indicadores de calidad');
    const head=node('div',null,'qco-header');
    const heading=node('div','Cantidades por bandeja','qco-title');
    const exit=node('button','×','qco-close');exit.type='button';exit.title='Cerrar';
    exit.setAttribute('aria-label','Cerrar');exit.addEventListener('click',()=>close());
    head.append(heading,exit);dialog.append(head);
    const body=node('div',null,'qco-body');
    const meta=node('div',null,'qco-meta');
    for(const val of [rec.tipo==='tunel'?'Túnel':'Carga',
      'Partida: '+(rec.partida||'—'),'Bandejas informadas: '+(rec.numBandejas||'—')])
      meta.append(node('span',val,'qco-chip'));
    body.append(meta);
 
    const form=node('form');form.noValidate=true;form.addEventListener('submit',save);
    // El Enter del teclado numérico avanza, nunca guarda por accidente.
    form.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.target?.tagName!=='INPUT'||event.target.type!=='number')return;
      event.preventDefault();
      const inputs=Array.from(form.querySelectorAll('input[type="number"]:not(:disabled)'));
      const pos=inputs.indexOf(event.target);
      const next=pos>=0?inputs[pos+1]:null;
      if(next)next.focus();else event.target.blur();
    });
    form.addEventListener('input',updateIndicatorVisibility);
    form.addEventListener('change',updateIndicatorVisibility);
    const total=node('label',null,'qco-total');
    const totalTitle=node('span','Nº bandejas inspeccionadas *');
    const qtyInput=node('input');qtyInput.type='number';qtyInput.inputMode='numeric';
    qtyInput.min='1';qtyInput.max='10000000';qtyInput.step='1';qtyInput.placeholder='Ej.: 80';qtyInput.required=true;
    qtyInput.disabled=true;qtyInput.enterKeyHint='next';
    total.append(totalTitle,qtyInput);form.append(total);
    for(const [category,name,opts] of CATS){
      const wrap=node('fieldset',null,'qco-cat');wrap.dataset.qcoCat=category;
      const legend=node('legend',name);
      const balance=node('span',null,'qco-balance');balance.hidden=true;
      legend.append(balance);wrap.append(legend);
      const choices=node('div',null,'qco-choices');
      for(const [option,label] of opts){
        const row=node('div',null,'qco-option');row.dataset.option=option;
        const optionLabel=node('label',label);
        const input=node('input');input.type='number';input.step='1';input.min='1';
        input.max='10000000';input.inputMode='numeric';input.placeholder='—';
        input.disabled=true;input.enterKeyHint='next';
        input.setAttribute('aria-label',name+' · '+label+' · número de bandejas');
        optionLabel.htmlFor='qco-'+category+'-'+option;
        input.id='qco-'+category+'-'+option;
        // Los checks existentes siguen en la ficha: aquí solo cantidades.
        if(option!=='noEvaluada'&&rec[category]?.[option])row.classList.add('qco-legacy-active');
        row.append(optionLabel,input);choices.append(row);
      }
      wrap.append(choices);form.append(wrap);
    }
    const feedback=node('div',null,'qco-feedback');feedback.hidden=true;
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    form.append(feedback);
    const indicators=node('details',null,'qco-indicators');indicators.hidden=true;
    const indicatorTitle=node('summary','Indicadores');
    indicators.append(indicatorTitle,node('div',null,'qco-indicator-list'));
    form.append(indicators);
    const foot=node('div',null,'qco-footer');
    const cancel=node('button','Cerrar','qco-secondary');cancel.type='button';
    cancel.addEventListener('click',()=>close());
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
    if(active){const same=record?.id===rec.id;close();if(active||same)return;}
    const thisSequence=++sequence;
    record={id:rec.id,tipo:rec.tipo,dia:rec.dia,partida:rec.partida};
    savedMeasurement=null;currentRules=null;loading=true;
    active=build(rec);
    mount();observeControl();
    original=JSON.stringify(snapshot());
    const modal=active;
    // No desplegar el teclado móvil antes de recibir los datos.
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
      if(window.matchMedia?.('(min-width: 561px)').matches)
        modal.querySelector('.qco-total input').focus({preventScroll:true});
      renderIndicators(false);
      // Criterios opcionales: su consulta nunca debe retrasar ni impedir guardar.
      fetchRules(jwt,rec.tipo).then(rules=>{
        if(sequence!==thisSequence||active!==modal)return;
        currentRules=rules;renderIndicators(false);
      }).catch(()=>{
        if(sequence!==thisSequence||active!==modal)return;
        currentRules=null;renderIndicators(false);
      });
    }catch(err){
      if(sequence!==thisSequence||active!==modal)return;
      loading=false;
      report(err.message==='FORBIDDEN'?'No tienes permiso para cuantificar este control.':
        err.message==='CONFLICT'?'La partida ha cambiado: vuelve a cargar el control.':
        'No se han podido recuperar las cantidades. El guardado está desactivado para evitar sobrescribir información.','error');
    }
  }
  window.QCOperativo=Object.freeze({open});
})();
