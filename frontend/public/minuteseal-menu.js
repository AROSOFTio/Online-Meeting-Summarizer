/* Shared, dependency-free off-canvas navigation for Next.js and registration. */
(function(){
  if(window.__msMenuReady)return;
  window.__msMenuReady=true;
  var selector=".ms-mobile-menu";
  var desktop=window.matchMedia("(min-width:1280px)");
  function close(menu,restore){
    if(!menu||!menu.open)return;
    menu.open=false;
    if(restore)menu.querySelector("summary")?.focus();
  }
  document.addEventListener("click",function(event){
    var button=event.target.closest(".ms-menu-backdrop");
    if(button){close(button.closest(selector),true);return;}
    var link=event.target.closest(".ms-mobile-links a");
    if(link)close(link.closest(selector),false);
  });
  document.addEventListener("toggle",function(event){
    var menu=event.target;
    if(!(menu instanceof HTMLDetailsElement)||!menu.matches(selector))return;
    var summary=menu.querySelector("summary");
    summary?.setAttribute("aria-label",menu.open?"Close navigation":"Open navigation");
    if(menu.open){
      if(desktop.matches){close(menu,false);return;}
      summary?.focus();
    }
  },true);
  document.addEventListener("keydown",function(event){
    var menu=document.querySelector(selector+"[open]");
    if(!menu||desktop.matches)return;
    if(event.key==="Escape"){event.preventDefault();close(menu,true);return;}
    if(event.key!=="Tab")return;
    var items=Array.from(menu.querySelectorAll("summary,.ms-mobile-links a[href]"));
    var first=items[0],last=items[items.length-1];
    if(event.shiftKey&&(document.activeElement===first||!menu.contains(document.activeElement))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!menu.contains(document.activeElement))){event.preventDefault();first?.focus();}
  });
  desktop.addEventListener("change",function(event){if(event.matches)document.querySelectorAll(selector+"[open]").forEach(function(menu){close(menu,false);});});
  window.addEventListener("pageshow",function(){document.querySelectorAll(selector+"[open]").forEach(function(menu){close(menu,false);});});
})();
