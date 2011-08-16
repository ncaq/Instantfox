var Cc = Components.classes
var Ci = Components.interfaces

Components.utils.import("resource://gre/modules/Services.jsm");
ibp = Components.utils.import('chrome://instantfox/content/instantfoxModule.js')

//************** find all avaliable locales

function updateLocaleList(){
	ibp.pluginLoader.getAvaliableLocales(function(locales)  {
		var sbs = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
		var langNames = sbs.createBundle("chrome://global/locale/languageNames.properties");
		var regNames  = sbs.createBundle("chrome://global/locale/regionNames.properties");
		
		function addDisplayName(locale) {
			var parts = locale.split(/-/); 
			var displayName;
			try {
				displayName = langNames.GetStringFromName(parts[0]);
				try {
					displayName += " (" + regNames.GetStringFromName((parts[1]||parts[0]).toLowerCase()) + ")";
				} catch (e) {}
			} catch (e) {
				displayName = '';
			}
			return {displayName: displayName, id: locale}
		}
		
		var locales = locales.map(addDisplayName)
		
		locales.sort(function(x, y)x.displayName > y.displayName)
		
		var xml = []
		for each(var i in locales)
			xml.push('<menuitem label="', i.id, '">',
				'<label value="', i.displayName, '"/><hbox flex="1"/><label value="', i.id, '"/>',
			'</menuitem>')
		
		var menulist = $('locale')
		appendXML(menulist.firstChild, xml.join(''))
		
		// find selected index
		var sl = InstantFoxModule.selectedLocale.toLowerCase()
		var slPart = sl.substring(0, sl.indexOf('-'))
		var si = -1, siPart = -1;
		for (var i in locales){
			var loc = locales[i].id.toLowerCase()
			if(loc == sl){
				si = i
				break
			}
			if(loc == slPart){
				siPart = i
			}
		}
		if(si == -1)
			si = siPart

		menulist.selectedIndex = si
	})
}
//************* dom utils
function $(id){
	return document.getElementById(id)
}
function $t(el, aID) {
	
	return el && el.getElementsByAttribute('aID', aID)[0]
}
function $parent(el){
	while(el){
		if(el.id)
			return el
		el=el.parentNode
	}
}

function clean(el){
	var ch
	while(ch=el.lastChild)
		el.removeChild(ch)
}
function appendXML(element, xml){
	var range = document.createRange()
	range.selectNode(element)
	range.collapse(true)
	var fragment = range.createContextualFragment(xml)

	return element.appendChild(fragment)
}
function replaceXML(element, xml){
	var range = document.createRange()
	range.selectNode(element)	
	var fragment = range.createContextualFragment(xml)

	return element.parentNode.replaceChild(fragment, element)
}
function formatString(string, options){	
	return string.replace(/\$[^\$]*\$/g, function(x){
		var x = x.slice(1,-1)
		if(x[0]=='!')
			return options[x.substr(1)]?'false':'true'
		if(typeof options[x]!='string')
			return options[x]?options[x].toString():''
		return escapeHTML(options[x]||'')
	})
}
function escapeHTML(str) str.replace(/[&"<>]/g, function(m)"&"+escapeMap[m]+";");
var escapeMap = { "&": "amp", '"': "quot", "<": "lt", ">": "gt" }

//************************ context menu
initContextMenu = function(popup){
	var item = document.popupNode	
	item = $parent(item)
	var selectedItems = item.parentNode.selectedItems

	$t(popup, 'disableInstant').setAttribute('checked', !selectedItems.some(function(x){
		return InstantFoxModule.Plugins[x.id].disableInstant
	}))
	$t(popup, 'disabled').setAttribute('checked', !selectedItems.some(function(x){
		return InstantFoxModule.Plugins[x.id].disabled
	}))
	$t(popup, 'hideFromContextMenu').setAttribute('checked', !selectedItems.some(function(x){
		return InstantFoxModule.Plugins[x.id].hideFromContextMenu
	}))
	var editItem = $t(popup, 'edit')
	var visible = selectedItems.length == 1 && !InstantFoxModule.Plugins[selectedItems[0].id].disabled
	editItem.hidden = editItem.previousSibling.hidden = !visible
}
onContextMenuCommand = function(e){
	var menu = e.target
	var name = menu.getAttribute('aID')
	var item = document.popupNode	
	item = $parent(item)
	if (name=='edit'){
		openEditLigthbox({target: item.lastChild})
		return
	}
	
	var selectedItems = item.parentNode.selectedItems	
	var value = menu.getAttribute('checked')!='true'
	selectedItems.forEach(function(x){

		InstantFoxModule.Plugins[x.id][name] = value
	})
	if (name == 'disabled')
		rebuild(true)
}

//************************ edit popup utils
var gPlugin, gPluginsChanged, gPrefChanged, resultOK=true;
openEditLigthbox = function(e){
	var item = e.target;
	var aID = item.getAttribute('aID')
	//**********
	if (aID == 'enable-link') {
		var item = $parent(e.target)
		gPlugin = InstantFoxModule.Plugins[item.id]
		gPlugin.disabled = false
		saveGPlugin()
		return
	}
	if (!aID && item.className == 'separator'){
		var start = item.nextSibling, end = item = start

		while((item = item.nextSibling) && ( item.nodeName == 'richlistitem')  ){
			end = item
		}
		start.parentNode.selectItemRange(start, end)
	}
	
	//**********
	if (aID != 'edit-link')
		return;

	var panel = $('edit-box')

	if ( panel.state!='closed') {
		panel.hidePopup()
		return
	}
	
	var item = $parent(e.target)
	gPlugin = InstantFoxModule.Plugins[item.id]
	
	$t(panel, 'suggest').checked = !gPlugin.disableSuggest
	$t(panel, 'instant').checked = !gPlugin.disableInstant
	$t(panel, 'image').src = gPlugin.iconURI
	$t(panel, 'key').value = gPlugin.key
	
	for each(var i in ['url', 'name']){
		var box = $t(panel, i)
		box.value = gPlugin[i]
		box.nextSibling.hidden = !canResetProp(box)
	}
	
	var rem =  $t(panel, 'remove')
	rem.label = gPlugin.type == 'user' ? 'remove': 'disable';
	rem.hidden = false;
	
	var popupBoxObject = panel.popupBoxObject;
	popupBoxObject.setConsumeRollupEvent(popupBoxObject.ROLLUP_NO_CONSUME);
	panel.openPopup(item.firstElementChild,'before_start',0,0,false,true)
	
}
editPopupSave = function(panel){
	if(!gPlugin)
		return
	if(gPlugin=='createNew'){
		var createNew = true
		gPlugin = createEmptyPlugin()
	}
	gPlugin.disableSuggest = !$t(panel, 'suggest').checked
	gPlugin.disableInstant = !$t(panel, 'instant').checked

	gPlugin.name = $t(panel, 'name').value
	gPlugin.url = $t(panel, 'url').value
	gPlugin.key = $t(panel, 'key').value
	gPlugin.iconURI = $t(panel, 'image').src

	saveGPlugin(createNew)
}
saveGPlugin = function(createNew){
	if (createNew) {
		ibp.fixupPlugin(gPlugin)
		if(!gPlugin.url)
			return
		InstantFoxModule.Plugins[gPlugin.id] = gPlugin;
		appendXML($("shortcuts"), plugin2XML(gPlugin))
	} else {
		var el = $(gPlugin.id)
		if (!el)
			return;
		var container = el.parentNode
		var si = container.selectedIndex
		replaceXML(el, plugin2XML(gPlugin))
		container.selectedIndex = si
	}
	ibp.pluginLoader.initShortcuts()
	markConflicts()
	
	gPluginsChanged = true
}
createEmptyPlugin=function(){
	var i=0
	while(InstantFoxModule.Plugins['user'+i])
		i++
	return {
		type: 'user',
		id: 'user'+i
	}	
}
addPlugin=function(e){
	var panel = $('edit-box')
		
	var item = $parent(e.target)
	gPlugin = 'createNew'
	
	$t(panel, 'suggest').checked = true
	$t(panel, 'instant').checked = false
	$t(panel, 'name').value = ''
	$t(panel, 'key').value = ''
	
	var urlBox = $t(panel, 'url')
	for each(var i in ['url', 'name']){
		var box = $t(panel, i)
		box.value = ''
		box.nextSibling.hidden = true
	}
	$t(panel, 'image').src = ''	
	var rem =  $t(panel, 'remove')
	rem.label = 'cancel';
	rem.hidden = false;

	var popupBoxObject = panel.popupBoxObject;
	popupBoxObject.setConsumeRollupEvent(popupBoxObject.ROLLUP_NO_CONSUME);
	panel.openPopup(item,'before_start',0,0,false,true)
}
removePlugin=function(p) {
	if (p == 'createNew') {
		gPlugin = null
	}else if (p.type != 'user' ) {
		p.disabled = true		
	} else {
		delete InstantFoxModule.Plugins[p.id];
		ibp.pluginLoader.initShortcuts()
		markConflicts()
		
		var item = $(p.id)
		item.parentNode.removeChild(item)
	}
	
	gPluginsChanged = true
}
canResetProp = function(el){
	var name = el.getAttribute('aID')
	return gPlugin.type == 'default' &&
		gPlugin['def_' + name] != null &&
		gPlugin['def_' + name] != el.value
}
resetPluginProp = function(self){
	var el = self.previousSibling
	var name = el.getAttribute('aID')
	el.value = gPlugin['def_'+name]
	var e=document.createEvent('UIEvent')
	e.initUIEvent('input',true, true, window, 1)
	el.dispatchEvent(e)
}
//*************************

function markConflicts(){
	var cf = InstantFoxModule.ShortcutConflicts || {}

	for (var id in InstantFoxModule.Plugins){
		var key = $t($(id), 'key')

		if(cf[id])
			key.setAttribute('conflict', cf[id])
		else
			key.removeAttribute('conflict')
	}
}
onTextboxInput = function(el){
	var id = $parent(el).id
	var orig = InstantFoxModule.Plugins[id].key
	InstantFoxModule.Plugins[id].key = el.value
	dump(id,InstantFoxModule.Plugins[id].key)
	ibp.pluginLoader.initShortcuts()
	markConflicts()
	InstantFoxModule.Plugins[id].key = orig
}
onTextboxEnter = function(el){
	var id = $parent(el).id
	InstantFoxModule.Plugins[id].key = el.value
	ibp.pluginLoader.initShortcuts()
	markConflicts()
	
	gPluginsChanged = true
}
onTextboxEscape = function(el){
	var id = $parent(el).id
	el.value = InstantFoxModule.Plugins[id][el.className]
	el.blur()
}
window.addEventListener('keydown', function(e){
	var el = e.target
	if(el.className == 'key'){
		dump(e.keyCode)
		if(e.keyCode=='27'){
			onTextboxEscape(el)
		}
		if(e.keyCode=='13'){
			el.blur()
			$parent(el).parentNode.focus()
		}
		if(e.keyCode=='40'||e.keyCode=='38'){
			dump($parent(el).parentNode.selectedItem.id)
			$t($parent(el).parentNode.selectedItem,'key').focus()
		}
	}
}, false)

onSelect=function(rbox){
	var el=document.activeElement
	if(el.localName=='input'&&el.parentNode.parentNode.className=='key'){
		$t(rbox.selectedItem,'key').focus()
	}
}



//************* 
function savePlugins(){
	if(gPrefChanged)
		document.getElementsByTagName('prefpane')[0].writePreferences(false)

	var em = Services.wm.getEnumerator('navigator:browser')
	while(em.hasMoreElements())
		em.getNext().InstantFox.updateUserStyle()

	if(!gPluginsChanged)
		return
	if(resultOK)
		InstantFoxModule.pluginLoader.savePlugins()
	else
		InstantFoxModule.pluginLoader.loadPlugins()
	gPluginsChanged = false
}
//************* 
xmlFragment = 
	  <richlistitem align="center" id='$id$'>
		<hbox align="center" class='image'>
			<image src="$iconURI$" width="16" height="16"/>
		</hbox>
		<label value="$name$"/>
		<spacer flex='1' />
		<hbox align="center" class='key'>
			<textbox class='key' aID='key' value='$key$' tooltiptext='edit plugin key'
				onblur='onTextboxEnter(this)' oninput='onTextboxInput(this)'/>
		</hbox>
		<label class='link' value='edit' aID='edit-link'/>
	  </richlistitem>.toXMLString().replace(/>\s*</g,'><')
xmlFragmentDis = 
	  <richlistitem align="center" id='$id$' disabled="true">
		<hbox align="center" class='image'>
			<image src="$iconURI$" width="16" height="16"/>
		</hbox>
		<label value="$name$"/>
		<spacer flex='1' />
		<textbox class='key hidden' aID='key'/>
		<label class='link' value='enable' aID='enable-link'/>
	  </richlistitem>.toXMLString().replace(/>\s*</g,'><')

function plugin2XML(p){
	return formatString(p.disabled?xmlFragmentDis:xmlFragment, p)
}

rebuild = function(){
	var xml=[], userxml = [], disabledxml = [];
	var activePlugins = InstantFoxModule.Plugins
	for each(var p in activePlugins){
		if(p.url){
			var dis = p.disabled, def = p.type=='default'
			var px = plugin2XML(p)
			if(dis)
				disabledxml[p.disabled?'unshift':'push'](px)
			else
				(def ? xml : userxml).push(px)
		}
	}
	var sepXML1 = "<label class='separator' value='   ", sepXML2 =" search plugins'/>"

	xml.unshift(sepXML1 + "standard" + sepXML2)
	if(userxml.length)
		xml.push(sepXML1 + "your" + sepXML2)
	
	if(disabledxml.length)
		userxml.push(sepXML1 + "inactive" + sepXML2)
	
	var el = $("shortcuts");
	clean(el)
	appendXML(el, xml.join('') + userxml.join('')+ disabledxml.join('')	)
	
	markConflicts()
}


window.addEventListener("DOMContentLoaded", function() {
	window.removeEventListener("DOMContentLoaded", arguments.callee, false)
	// this must be called after menulists' binding is loaded 
	updateLocaleList()
	rebuild()
	var size = document.getElementsByTagName('tabbox')[0].clientWidth + 100;
	// check if we are inside popup
	var InstantFox = top.InstantFox
	if (InstantFox) {
		window.close = InstantFox.closeOptionsPopup
		var el = document.getElementById('pinbox')
		el.hidden = false
		el.firstChild.checked = !!InstantFox.popupPinned
dump(size)
		InstantFox.updatePopupSize(size)
		// don't let clicks inside options window to close popup
		window.addEventListener('mousedown', InstantFox.popupClickListener, false)
	} else {
		setTimeout(function(){
			var el=$('shortcuts')
			var delta = el._scrollbox.scrollWidth-el.clientWidth
			if (delta>0) {
				window.resizeBy(delta+50, 0)
				dump('this must not happen *************************************')
			}
		}, 100)
	}

}, false)

/*
gBrowser.mCurrentBrowser.engines[0].uri

if (target.getAttribute("class").indexOf("addengine-item") != -1) {
	var searchService =
		Cc["@mozilla.org/browser/search-service;1"]
			  .getService(Ci.nsIBrowserSearchService);
	// We only detect OpenSearch files
	var type = Components.interfaces.nsISearchEngine.DATA_XML;
	searchService.addEngine(target.getAttribute("uri"), type,
							target.getAttribute("src"), false);
}
*/

function onTabSelect(){
	if(!this.pane1Ready && this.selectedIndex==1){
		this.pane1Ready=true;
		this.parentNode.selectedPanel.firstChild.hidden=false;gPrefChanged=true;
		$('keyword-URL-menu').firstChild.firstChild.label = 
			InstantFoxModule.Plugins.google.url.replace('q=%q&','')+'&q=%q';
	}else if(!this.pane2Ready && this.selectedIndex==2){
		this.pane2Ready=true;
		var iframe = document.createElement('iframe');
		iframe.setAttribute('type', 'content');
		iframe.setAttribute('src', 'resource://instantfox/about.html');
		iframe.setAttribute('flex', '1');
		this.parentNode.selectedPanel.appendChild(iframe);
	}
	//$("add").hidden = this.selectedIndex != 0
}