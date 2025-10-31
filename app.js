// Quix app logic (moved from inline script)
// Uses localStorage for instant persistence and IndexedDB as secondary store.
// Swipe to reveal delete + radio toggle moves done items to bottom.

const LS_KEY = 'quix.items.v1';

// Minimal IndexedDB helper (promisified)
const idb = (function(){
  const name = 'quix-db';
  const version = 1;
  let dbp = null;
  function open(){
    if(dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const rq = indexedDB.open(name, version);
      rq.onupgradeneeded = ev => {
        const db = ev.target.result;
        if(!db.objectStoreNames.contains('items')){
          db.createObjectStore('items',{keyPath:'id'});
        }
      };
      rq.onsuccess = e => resolve(e.target.result);
      rq.onerror = e => reject(e.target.error);
    });
    return dbp;
  }
  async function put(item){
    const db = await open();
    return new Promise((res, rej)=>{
      const tx = db.transaction('items','readwrite');
      tx.objectStore('items').put(item);
      tx.oncomplete = ()=>res();
      tx.onerror = ()=>rej(tx.error);
    });
  }
  async function bulkPut(items){
    const db = await open();
    return new Promise((res, rej)=>{
      const tx = db.transaction('items','readwrite');
      const store = tx.objectStore('items');
      items.forEach(i=>store.put(i));
      tx.oncomplete = ()=>res();
      tx.onerror = ()=>rej(tx.error);
    });
  }
  async function getAll(){
    const db = await open();
    return new Promise((res, rej)=>{
      const tx = db.transaction('items','readonly');
      const req = tx.objectStore('items').getAll();
      req.onsuccess = ()=>res(req.result);
      req.onerror = ()=>rej(req.error);
    });
  }
  return {put, getAll, bulkPut};
})();

// App state: items = [{id, text, done, created}]
let items = [];

const noteEl = document.getElementById('note');
const storeBtn = document.getElementById('store');
const itemsWrap = document.getElementById('items');

// Utility
function uid(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4); }

// Load from localStorage or fallback to IndexedDB
function loadState(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      items = JSON.parse(raw);
      return Promise.resolve();
    } else {
      // fallback from idb
      return idb.getAll().then(found=>{
        if(found && found.length) items = found.sort((a,b)=>a.created-b.created);
      }).catch(()=>{ items = []; });
    }
  } catch(e){
    items = [];
    return Promise.resolve();
  }
}

function saveState(){
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    // persist to IndexedDB asynchronously (best-effort)
    idb.bulkPut(items).catch(()=>{/* ignore */});
  } catch(e){}
}

// Render items - done items go to bottom
function render(){
  // split
  const active = items.filter(i=>!i.done).sort((a,b)=>a.created-b.created);
  const done = items.filter(i=>i.done).sort((a,b)=>a.created-b.created);
  itemsWrap.innerHTML = '';
  const renderItem = (it)=>{
    const row = document.createElement('div');
    row.className = 'item';
    row.dataset.id = it.id;

    // content wrap for sliding
    const contentWrap = document.createElement('div');
    contentWrap.className = 'content-wrap';
    contentWrap.setAttribute('role','listitem');

    const radio = document.createElement('div');
    radio.className = 'radio' + (it.done ? ' checked' : '');
    radio.setAttribute('aria-checked', String(it.done));
    radio.setAttribute('role','button');
    radio.tabIndex = 0;
    radio.addEventListener('click', toggleDone.bind(null, it.id));
    radio.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' ') toggleDone(it.id); });

    // -- text (click to edit) --
    const text = document.createElement('div');
    text.className = 'text' + (it.done ? ' done' : '');
    text.innerText = it.text;
    // single tap to start inline edit
    text.addEventListener('click', (ev)=>{ ev.stopPropagation(); startInlineEdit(it.id, text); });

    contentWrap.appendChild(radio);
    contentWrap.appendChild(text);

    // actions area (delete)
    const actions = document.createElement('div');
    actions.className = 'actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.innerText = 'Delete';
    delBtn.addEventListener('click', ()=>deleteItem(it.id));
    actions.appendChild(delBtn);

    // Assemble item
    row.appendChild(contentWrap);
    row.appendChild(actions);

    // Touch / mouse sliding behaviour
    attachSlide(row, contentWrap);

    return row;
  };

  active.forEach(it=>itemsWrap.appendChild(renderItem(it)));
  done.forEach(it=>itemsWrap.appendChild(renderItem(it)));
}

// Inline editing helpers: start editing an item's text, save on outside tap or Enter
function startInlineEdit(id, textEl){
  // If already editing this item, noop
  if(window.__editing && window.__editing.id === id) return;
  // If another edit is open, commit it first
  if(window.__editing){
    // save previous
    const prev = window.__editing;
    commitInlineEdit(prev.id, prev.input);
  }
  const item = items.find(i=>i.id===id);
  if(!item) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit';
  input.value = item.text;
  input.style.width = '100%';
  input.style.font = 'inherit';
  input.style.color = 'inherit';
  input.style.background = 'transparent';
  input.style.border = 'none';
  input.style.outline = 'none';
  input.style.padding = '0';

  // replace textEl with input
  textEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(0, input.value.length);

  function onDocPointerDown(e){
    if(e.target === input) return; // clicked inside input -> ignore
    commitInlineEdit(id, input);
  }
  function onKeydown(e){
    if(e.key === 'Enter') { commitInlineEdit(id, input); e.preventDefault(); }
    if(e.key === 'Escape') { cancelInlineEdit(input); }
  }
  function commitInlineEdit(commitId, inputEl){
    const val = inputEl.value.trim();
    if(val){
      const idx = items.findIndex(i=>i.id===commitId);
      if(idx>-1){ items[idx].text = val; saveState(); }
    }
    cleanup();
    render();
    document.removeEventListener('pointerdown', onDocPointerDown, true);
  }
  function cancelInlineEdit(inputEl){
    cleanup();
    render();
    document.removeEventListener('pointerdown', onDocPointerDown, true);
  }
  function cleanup(){
    if(window.__editing){
      window.__editing = null;
    }
  }

  window.__editing = { id, input };
  document.addEventListener('pointerdown', onDocPointerDown, true);
  input.addEventListener('keydown', onKeydown);
}

// FLIP helpers: capture positions and animate reordering
function getPositions(){
  const rects = {};
  itemsWrap.querySelectorAll('.item').forEach(el=>{
    rects[el.dataset.id] = el.getBoundingClientRect().top;
  });
  return rects;
}
function animateReorder(prevRects){
  const ease = 'transform 260ms cubic-bezier(.2,.8,.2,1)';
  itemsWrap.querySelectorAll('.item').forEach(el=>{
    const id = el.dataset.id;
    const prev = prevRects[id];
    if(prev == null) return;
    const newTop = el.getBoundingClientRect().top;
    const delta = prev - newTop;
    if(Math.abs(delta) > 0.5){
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      el.style.willChange = 'transform';
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          el.style.transition = ease;
          el.style.transform = 'translateY(0)';
          const cleanup = ()=>{
            el.style.transition = '';
            el.style.transform = '';
            el.style.willChange = '';
            el.removeEventListener('transitionend', cleanup);
          };
          el.addEventListener('transitionend', cleanup);
        });
      });
    }
  });
}

// toggle done and move item to bottom (done)
function toggleDone(id){
  const idx = items.findIndex(i=>i.id===id);
  if(idx<0) return;
  // capture positions before change
  const prev = getPositions();
  items[idx].done = !items[idx].done;
  saveState();
  render();
  // animate from previous positions to new positions
  animateReorder(prev);
}

function deleteItem(id){
  items = items.filter(i=>i.id!==id);
  saveState();
  render();
}

function storeNote(){
  const t = noteEl.value.trim();
  if(!t) return flash(noteEl);
  const it = { id: uid(), text: t, done:false, created: Date.now() };
  items.push(it);
  noteEl.value = '';
  saveState();
  render();
  // focus ready for next
  noteEl.focus();
}

// tiny visual flash for empty input
function flash(el){
  el.style.transition = 'transform 150ms';
  el.style.transform = 'translateX(-6px)';
  setTimeout(()=>{ el.style.transform='translateX(6px)'; },150);
  setTimeout(()=>{ el.style.transform=''; },300);
}

// Attach simple sliding (left) to reveal delete (works on touch + mouse)
function attachSlide(itemEl, contentEl){
  let startX = 0, currentX = 0, dragging = false, pointerId = null;
  const maxReveal = 64; // px (was 84)
  const threshold = 16; // smaller threshold
  function setTranslate(tx){ contentEl.style.transform = `translateX(${tx}px)`; }

  // Helper to close other open items
  function closeOtherOpen(exceptEl){
    itemsWrap.querySelectorAll('.item.open').forEach(el=>{
      if(el === exceptEl) return;
      el.classList.remove('open');
      const cw = el.querySelector('.content-wrap');
      if(cw){
        cw.style.transition = 'transform 160ms ease';
        cw.style.transform = 'translateX(0)';
      }
    });
  }

  // Helper to set open state
  function setOpen(open){
    if(open){
      // close others first
      closeOtherOpen(itemEl);
      itemEl.classList.add('open');
    } else {
      itemEl.classList.remove('open');
    }
  }

  // Prefer Pointer Events for consistent handling across touch/mouse
  function onPointerDown(e){
    if(e.pointerType === 'mouse' && e.button !== 0) return; // only left mouse
    // close any previously opened item when starting interaction on this one
    closeOtherOpen(itemEl);
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    try{ itemEl.setPointerCapture(pointerId); }catch(_){/*ignore*/}
    itemEl.style.transition = 'none';
    contentEl.style.transition = 'none';
  }
  function onPointerMove(e){
    if(!dragging || e.pointerId !== pointerId) return;
    currentX = e.clientX;
    const dx = currentX - startX;
    if(dx < 0){
      const tx = Math.max(dx, -maxReveal);
      setTranslate(tx);
      // show partial reveal visually but keep actions hidden until threshold
      if(tx <= -threshold) setOpen(false); // don't add open until release
    } else {
      setTranslate(0);
    }
  }
  function onPointerUp(e){
    if(!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragging = false;
    try{ itemEl.releasePointerCapture(pointerId); }catch(_){/*ignore*/}
    pointerId = null;
    contentEl.style.transition = 'transform 160ms ease';
    const computed = contentEl.style.transform || '';
    const final = parseFloat(computed.replace('translateX(','').replace('px)','') || 0);
    if(final <= -threshold){
      setTranslate(-maxReveal);
      setOpen(true);
    } else {
      setTranslate(0);
      setOpen(false);
    }
  }

  itemEl.addEventListener('pointerdown', onPointerDown);
  itemEl.addEventListener('pointermove', onPointerMove);
  itemEl.addEventListener('pointerup', onPointerUp);
  itemEl.addEventListener('pointercancel', onPointerUp);

  // close if user taps the content when it's open
  contentEl.addEventListener('click', (e)=>{
    const matrix = contentEl.style.transform || '';
    const final = parseFloat(matrix.replace('translateX(','').replace('px)','') || 0);
    if(final <= -maxReveal + 1) {
      // if open and tapped, close
      setTranslate(0);
      setOpen(false);
    }
  });

  // Fallback for older browsers without Pointer Events
  if(!window.PointerEvent){
    let tStartX = 0, tDragging = false;
    function onStart(e){
      // close any other open item before starting
      closeOtherOpen(itemEl);
      tDragging = true;
      tStartX = (e.touches ? e.touches[0].clientX : e.clientX);
      itemEl.style.transition = 'none';
      contentEl.style.transition = 'none';
    }
    function onMove(e){
      if(!tDragging) return;
      const cur = (e.touches ? e.touches[0].clientX : e.clientX);
      const dx = cur - tStartX;
      if(dx < 0){
        const tx = Math.max(dx, -maxReveal);
        setTranslate(tx);
      } else {
        setTranslate(0);
      }
    }
    function onEnd(){
      if(!tDragging) return;
      tDragging = false;
      contentEl.style.transition = 'transform 160ms ease';
      const computed = contentEl.style.transform || '';
      const final = parseFloat(computed.replace('translateX(','').replace('px)','') || 0);
      if(final <= -threshold) { setTranslate(-maxReveal); setOpen(true); } else { setTranslate(0); setOpen(false); }
    }
    itemEl.addEventListener('touchstart', onStart, {passive:true});
    itemEl.addEventListener('touchmove', onMove, {passive:true});
    itemEl.addEventListener('touchend', onEnd);
    itemEl.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }
}

// initial wiring
storeBtn.addEventListener('click', storeNote);
noteEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); storeNote(); }});

// autofocus on open
window.addEventListener('load', ()=>{
  loadState().then(()=>{ render(); noteEl.focus(); });
});

// Install / service worker register
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{/* ignore */});
}

// Expose a tiny reset for dev (not visible)
window.__quix = { getItems: ()=>items, clearAll: ()=>{items=[]; saveState(); render(); } };
