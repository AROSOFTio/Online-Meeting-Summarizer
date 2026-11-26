/* Registration wizard: native form submission and server-side validation remain authoritative. */
(function(){
 const form=document.querySelector('[data-wizard]');
 if(!form)return;
 const card=form.closest('.wizard-card'),steps=card.querySelector('.wizard-steps'),panels=Array.from(form.querySelectorAll('[data-step]')),tabs=Array.from(steps.querySelectorAll('[data-go]')),actions=form.querySelector('.wizard-actions'),back=form.querySelector('.wizard-back'),next=form.querySelector('.wizard-next'),submit=form.querySelector('.wizard-submit'),count=form.querySelector('.wizard-count'),review=form.querySelector('.wizard-review');
 let current=0,furthest=0,submitting=false;
 const valid=(i)=>{for(const field of panels[i].querySelectorAll('input,select')){if(!field.checkValidity()){field.reportValidity();field.focus();return false;}}return true;};
 function show(i,focus=true){
  current=i;furthest=Math.max(furthest,i);
  panels.forEach((panel,n)=>panel.hidden=n!==i);
  tabs.forEach((tab,n)=>{tab.disabled=n>furthest;tab.dataset.complete=String(n<i);if(n===i)tab.setAttribute('aria-current','step');else tab.removeAttribute('aria-current');});
  back.disabled=i===0;back.style.visibility=i===0?'hidden':'visible';
  next.hidden=i===panels.length-1;submit.hidden=i!==panels.length-1;
  count.textContent='Step '+(i+1)+' of '+panels.length;
  if(i===2){review.hidden=false;review.querySelectorAll('[data-review]').forEach(el=>{el.textContent=form.elements.namedItem(el.dataset.review).value.trim();});}
  if(focus)panels[i].querySelector('h3').focus({preventScroll:true});
 }
 steps.hidden=false;actions.hidden=false;form.querySelector('.wizard-fallback').hidden=true;
 form.noValidate=true; // Explicitly reveal invalid fields before native validation messages.
 next.addEventListener('click',()=>{if(valid(current))show(current+1);});
 back.addEventListener('click',()=>{if(current>0)show(current-1);});
 tabs.forEach((tab,i)=>tab.addEventListener('click',()=>{if(i<=current){show(i);return;}for(let n=current;n<i;n++)if(!valid(n))return;show(i);}));
 form.addEventListener('submit',event=>{
  if(submitting){event.preventDefault();return;}
  if(current<2){event.preventDefault();if(valid(current))show(current+1);return;}
  for(let i=0;i<panels.length;i++){if(Array.from(panels[i].querySelectorAll('input,select')).some(f=>!f.checkValidity())){event.preventDefault();show(i);valid(i);return;}}
  submitting=true;submit.disabled=true;submit.textContent='Submitting…';
 });
 window.addEventListener('pageshow',()=>{submitting=false;submit.disabled=false;submit.textContent='Request workspace';});
 show(0,false);
})();
