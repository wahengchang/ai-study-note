#!/usr/bin/env python3
"""五角色審查後的跨 Spike canonical-contract verifier。"""
import hashlib, html, importlib.util, json, os, re, shutil, sqlite3, sys, tempfile
from pathlib import Path

sys.dont_write_bytecode = True

ROOT = Path(__file__).parents[2]
OUT = Path(__file__).with_name("evidence.json")
BASE = "/ai-study-note-reset/"

def b(v): return json.dumps(v, sort_keys=True, separators=(",", ":"), default=lambda value: {"bytes": value.hex()} if isinstance(value, bytes) else TypeError()).encode()
def h(v): return hashlib.sha256(v if isinstance(v, bytes) else b(v)).hexdigest()
def expect_error(fn, code):
    try: fn()
    except Exception as error:
        assert code in str(error), error
        return str(error)
    raise AssertionError(f"expected {code}")

def schema_and_lifecycle(events):
    db = sqlite3.connect(":memory:"); db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
    CREATE TABLE schema_versions(version INTEGER PRIMARY KEY, spec BLOB NOT NULL, digest TEXT NOT NULL);
    CREATE TRIGGER schema_no_update BEFORE UPDATE ON schema_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SCHEMA'); END;
    CREATE TRIGGER schema_no_delete BEFORE DELETE ON schema_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SCHEMA'); END;
    CREATE TABLE revisions(entry_id TEXT, revision_id TEXT, schema_version INTEGER NOT NULL REFERENCES schema_versions(version), bytes BLOB NOT NULL, digest TEXT NOT NULL, restored_from TEXT, PRIMARY KEY(entry_id,revision_id));
    CREATE TRIGGER revision_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
    CREATE TRIGGER revision_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
    CREATE TABLE pointers(entry_id TEXT PRIMARY KEY, current_id TEXT NOT NULL, published_id TEXT, FOREIGN KEY(entry_id,current_id) REFERENCES revisions(entry_id,revision_id), FOREIGN KEY(entry_id,published_id) REFERENCES revisions(entry_id,revision_id));
    """)
    v1={"title":"text","difficulty":"integer"}; db.execute("INSERT INTO schema_versions VALUES(1,?,?)",(b(v1),h(v1)))
    r1={"title":"published","difficulty":1}; r2={"title":"draft","difficulty":2,"marker":"DRAFT-ONLY-MARKER"}
    db.execute("INSERT INTO revisions VALUES(?,?,?,?,?,NULL)",("note-1","r1",1,b(r1),h(r1))); db.execute("INSERT INTO revisions VALUES(?,?,?,?,?,NULL)",("note-1","r2",1,b(r2),h(r2))); db.execute("INSERT INTO pointers VALUES('note-1','r2','r1')"); db.commit()
    before=h([list(x) for x in db.execute("SELECT * FROM revisions")])
    events.append({"case":"immutable-schema","update":expect_error(lambda:db.execute("UPDATE schema_versions SET spec=? WHERE version=1",(b({}),)),"IMMUTABLE_SCHEMA"),"delete":expect_error(lambda:db.execute("DELETE FROM schema_versions WHERE version=1"),"IMMUTABLE_SCHEMA")})
    events.append({"case":"composite-pointer-fk","missing":expect_error(lambda:db.execute("UPDATE pointers SET published_id='missing' WHERE entry_id='note-1'"),"FOREIGN KEY" )})
    # Incompatible migration must transform all pointers atomically; empty mapping rolls back.
    v2={"title":"text","difficulty":"select"}
    def migrate(rows):
      with db:
        if set(rows)!={"r1","r2"}: raise ValueError("BACKFILL_INCOMPLETE")
        db.execute("INSERT INTO schema_versions VALUES(2,?,?)",(b(v2),h(v2)))
        for old,new in rows.items():
          payload=json.loads(db.execute("SELECT bytes FROM revisions WHERE entry_id='note-1' AND revision_id=?",(old,)).fetchone()[0]); payload["difficulty"]={1:"beginner",2:"intermediate"}[payload["difficulty"]]
          db.execute("INSERT INTO revisions VALUES(?,?,?,?,?,NULL)",("note-1",new,2,b(payload),h(payload)))
        db.execute("UPDATE pointers SET current_id='r2v2',published_id='r1v2' WHERE entry_id='note-1'")
    expect_error(lambda:migrate({}),"BACKFILL_INCOMPLETE"); assert db.execute("SELECT count(*) FROM schema_versions").fetchone()[0]==1
    migrate({"r1":"r1v2","r2":"r2v2"}); events.append({"case":"migration-cutover","old_digest":before,"current":"r2v2","published":"r1v2","schema":2})
    # Restore preserves pin/bytes/lineage, before media/route mutation checks.
    source=db.execute("SELECT schema_version,bytes FROM revisions WHERE entry_id='note-1' AND revision_id='r1'").fetchone()
    with db:
      db.execute("INSERT INTO revisions VALUES(?,?,?,?,?,?)",("note-1","r3",source[0],source[1],h(source[1]),"r1")); db.execute("UPDATE pointers SET current_id='r3' WHERE entry_id='note-1'")
    assert db.execute("SELECT schema_version,bytes,restored_from FROM revisions WHERE revision_id='r3'").fetchone()==(1,source[1],"r1")
    events.append({"case":"restore-lineage","source":"r1","restored":"r3","schema_pin":1})
    db.executescript("CREATE TABLE route_claims(graph TEXT, route TEXT, entry_id TEXT, revision_id TEXT, PRIMARY KEY(graph,route), FOREIGN KEY(entry_id,revision_id) REFERENCES revisions(entry_id,revision_id)); INSERT INTO route_claims VALUES('published','/notes/','note-1','r1v2'); INSERT INTO route_claims VALUES('current','/learn/','note-1','r3');")
    def restore_with_route(revision_id, route, fault=False):
      before_state=h({"revisions":[list(x) for x in db.execute("SELECT * FROM revisions")],"pointers":[list(x) for x in db.execute("SELECT * FROM pointers")],"claims":[list(x) for x in db.execute("SELECT * FROM route_claims")]})
      try:
        with db:
          db.execute("INSERT INTO revisions VALUES(?,?,?,?,?,?)",("note-1",revision_id,source[0],source[1],h(source[1]),"r1"))
          db.execute("UPDATE pointers SET current_id=? WHERE entry_id='note-1'",(revision_id,))
          db.execute("DELETE FROM route_claims WHERE graph='current' AND entry_id='note-1'")
          if fault: raise ValueError("ROUTE_CLAIM_CONFLICT")
          db.execute("INSERT INTO route_claims VALUES('current',?,?,?)",(route,"note-1",revision_id))
      except ValueError as error:
        after_state=h({"revisions":[list(x) for x in db.execute("SELECT * FROM revisions")],"pointers":[list(x) for x in db.execute("SELECT * FROM pointers")],"claims":[list(x) for x in db.execute("SELECT * FROM route_claims")]}); assert before_state==after_state; return str(error)
      return "OK"
    assert restore_with_route("r4","/learn/restored/",True)=="ROUTE_CLAIM_CONFLICT"
    assert restore_with_route("r4","/learn/restored/")=="OK"
    events.append({"case":"lifecycle-route-atomicity","fault_rollback":True,"published_claim":"/notes/","current_claim":"/learn/restored/"})
    db.close()

def routes_and_media(events):
    root=Path(tempfile.mkdtemp()); db=sqlite3.connect(root/"state.sqlite"); db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
    CREATE TABLE revisions(entry_id TEXT,revision_id TEXT,PRIMARY KEY(entry_id,revision_id));
    CREATE TABLE pointers(entry_id TEXT PRIMARY KEY,current_id TEXT,published_id TEXT,FOREIGN KEY(entry_id,current_id) REFERENCES revisions(entry_id,revision_id),FOREIGN KEY(entry_id,published_id) REFERENCES revisions(entry_id,revision_id));
    CREATE TABLE assets(version_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,availability TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL);
    CREATE TABLE refs(entry_id TEXT,revision_id TEXT,version_id TEXT REFERENCES assets(version_id),PRIMARY KEY(entry_id,revision_id,version_id),FOREIGN KEY(entry_id,revision_id) REFERENCES revisions(entry_id,revision_id));
    """)
    db.execute("CREATE TRIGGER asset_version_immutable BEFORE UPDATE OF checksum,mime,size ON assets BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ASSET_VERSION'); END;")
    obj=root/"objects"; stage=root/"stage"; obj.mkdir(); stage.mkdir(); old=b"old-media"; extra=b"extra-media"; new=b"new-media"
    for name,data in (("a1",old),("a2",new),("a3",extra)):
      checksum=h(data); (obj/checksum).write_bytes(data); db.execute("INSERT INTO assets VALUES(?,?,?,?,?)",(name,checksum,"ready","text/plain",len(data)))
    for rev,asset in (("pub","a1"),("pub","a3"),("draft","a2")):
      if not db.execute("SELECT 1 FROM revisions WHERE entry_id='note-1' AND revision_id=?",(rev,)).fetchone(): db.execute("INSERT INTO revisions VALUES('note-1',?)",(rev,))
      db.execute("INSERT INTO refs VALUES('note-1',?,?)",(rev,asset))
    db.execute("INSERT INTO pointers VALUES('note-1','draft','pub')"); db.commit()
    published={"/notes/":{"owner":"note-root","revision":"pub"},"/notes/intro/":{"owner":"note-1","revision":"pub"},"/":{"owner":"site","revision":"pub"},"/topics/ai/":{"owner":"term:ai","revision":"pub"},"/tags/ai/":{"owner":"tag:ai","revision":"pub"},"/notes/parent/":{"owner":"entry:parent","revision":"pub"}}; current={"/learn/":{"owner":"note-1","revision":"draft"},"/learn/intro/":{"owner":"note-1","revision":"draft"}}
    before={"published":json.loads(b(published)),"current":json.loads(b(current))}; before_hash=h(before)
    impact=[{"graph":"current","owner":"note-1","from":"/learn/","to":"/learn/guide/","sourceRevisionId":"draft"},{"graph":"current","owner":"note-1","from":"/learn/intro/","to":"/learn/guide/intro/","sourceRevisionId":"draft"}]
    current={"/learn/guide/":{"owner":"note-1","revision":"draft"},"/learn/guide/intro/":{"owner":"note-1","revision":"draft"}}
    assert published==before["published"]
    events.append({"case":"route-divergence","before_hash":before_hash,"impact":impact,"published_routes":sorted(published),"current_routes":sorted(current)})
    # Actual published selection and RestoreRevision unit-of-work.
    def select(published_only=True):
      pointer="published_id" if published_only else "current_id"; rows=db.execute(f"SELECT a.version_id,a.checksum,a.mime,a.size,a.availability FROM pointers p JOIN refs r ON r.entry_id=p.entry_id AND r.revision_id=p.{pointer} JOIN assets a ON a.version_id=r.version_id WHERE p.entry_id='note-1' ORDER BY a.version_id").fetchall()
      if not rows: raise ValueError("MEDIA_UNAVAILABLE")
      for row in rows:
        physical=obj/row[1]
        if row[4]!="ready": raise ValueError(f"MEDIA_UNAVAILABLE:{row[0]}")
        if not physical.exists() or h(physical.read_bytes())!=row[1] or len(physical.read_bytes())!=row[3] or row[2]!="text/plain": raise ValueError(f"MEDIA_CORRUPT:{row[0]}")
      return rows
    def restore_asset(version_id):
      with db: db.execute("UPDATE assets SET availability='ready' WHERE version_id=?",(version_id,))
      return {"code":"ASSET_RESTORED","owner":"DataMedia","subjectIds":[version_id]}
    def restore_revision(source):
      before=h({"revisions":[list(x) for x in db.execute("SELECT * FROM revisions")],"pointers":[list(x) for x in db.execute("SELECT * FROM pointers")],"refs":[list(x) for x in db.execute("SELECT * FROM refs")]})
      try:
        rows=db.execute("SELECT a.version_id,a.checksum,a.mime,a.size,a.availability FROM refs r JOIN assets a ON a.version_id=r.version_id WHERE r.entry_id='note-1' AND r.revision_id=? ORDER BY a.version_id",(source,)).fetchall()
        bad=next((row for row in rows if row[4]!="ready" or not (obj/row[1]).exists() or h((obj/row[1]).read_bytes())!=row[1] or len((obj/row[1]).read_bytes())!=row[3] or row[2]!="text/plain"),None)
        if not rows or bad: raise ValueError(f"BLOCKED_ARCHIVED_MEDIA_RESTORE:{bad[0] if bad else 'missing'}")
        with db:
          db.execute("INSERT INTO revisions VALUES('note-1','restored')"); [db.execute("INSERT INTO refs VALUES('note-1','restored',?)",(row[0],)) for row in rows]; db.execute("UPDATE pointers SET current_id='restored' WHERE entry_id='note-1'")
        return {"code":"RESTORED","owner":"DomainApplication","subjectIds":["restored"]}
      except ValueError as error:
        after=h({"revisions":[list(x) for x in db.execute("SELECT * FROM revisions")],"pointers":[list(x) for x in db.execute("SELECT * FROM pointers")],"refs":[list(x) for x in db.execute("SELECT * FROM refs")]}); assert before==after
        asset_id=str(error).split(":")[-1]; return {"code":str(error).split(":")[0],"owner":"DataMedia","subjectIds":[asset_id],"remediation":{"command":"RestoreAsset","assetId":asset_id}}
    assert [row[0] for row in select()]==["a1","a3"] and [row[0] for row in select(False)]==["a2"]
    with db: db.execute("UPDATE assets SET availability='archived' WHERE version_id='a1'")
    blocked=restore_revision("pub"); assert blocked["code"]=="BLOCKED_ARCHIVED_MEDIA_RESTORE" and blocked["remediation"]["command"]=="RestoreAsset"
    assert restore_asset("a1")["code"]=="ASSET_RESTORED" and restore_revision("pub")["code"]=="RESTORED"
    assert expect_error(lambda:db.execute("UPDATE assets SET checksum='bad' WHERE version_id='a1'"),"IMMUTABLE_ASSET_VERSION")
    events.append({"case":"media-selection-and-restore-gate","published":["a1","a3"],"current":["a2"],"blocked":blocked,"restore_command":True})
    # Restart reconciler handles discarded stage, broken pending intent, promotable pending intent and is idempotent.
    pending_bytes=b"pending"; pending_hash=h(pending_bytes); orphan_hash=h(b"orphan-final"); corrupt_hash=h(b"expected"); (stage/"orphan.partial").write_bytes(b"x"); (obj/pending_hash).write_bytes(pending_bytes); (obj/orphan_hash).write_bytes(b"orphan-final"); (obj/corrupt_hash).write_bytes(b"wrong")
    db.execute("INSERT INTO assets VALUES('pending-ready',?,?,?,?)",(pending_hash,"pending","text/plain",len(pending_bytes))); db.execute("INSERT INTO assets VALUES('pending-broken',?,?,?,?)",("missing","pending","text/plain",1)); db.execute("INSERT INTO assets VALUES('pending-corrupt',?,?,?,?)",(corrupt_hash,"pending","text/plain",len(b"expected"))); db.commit(); db.close()
    def reconcile(connection):
      actions=[]; owned={row[0] for row in connection.execute("SELECT checksum FROM assets")}
      for f in obj.iterdir():
        if f.name not in owned: f.unlink(); actions.append("drop-final-orphan")
      for f in stage.iterdir(): f.unlink(); actions.append("drop-stage")
      for version,checksum,mime,size in connection.execute("SELECT version_id,checksum,mime,size FROM assets WHERE availability='pending'"):
        physical=obj/checksum
        if physical.exists() and h(physical.read_bytes())==checksum and len(physical.read_bytes())==size and mime=="text/plain": connection.execute("UPDATE assets SET availability='ready' WHERE version_id=?",(version,)); actions.append("promote-ready")
        else: connection.execute("DELETE FROM assets WHERE version_id=?",(version,)); physical.unlink(missing_ok=True); actions.append("drop-broken")
      connection.commit(); return actions
    db=sqlite3.connect(root/"state.sqlite"); first=reconcile(db); second=reconcile(db); assert set(first)=={"drop-stage","promote-ready","drop-broken","drop-final-orphan"} and second==[]
    events.append({"case":"restart-reconciliation","first":first,"second":second,"idempotent":True,"orphan":False,"dangling":False}); db.close(); shutil.rmtree(root); return {"media":[{"id":"a1","bytes":old},{"id":"a3","bytes":extra}],"claims":[{"route":route,"owner":claim["owner"],"revision":claim["revision"]} for route,claim in published.items()],"routeGraphDigest":h(published),"routes":["" if route=="/" else route.strip("/")+"/" for route in sorted(published)]}

def projection_delivery_plugin(events, resolved):
    manifest=json.loads((ROOT/"spike-evidence/sp-a06/interactive-demo-plugin/manifest.json").read_text())
    assert manifest["id"]=="interactive-demo" and manifest["version"]=="0.1.0" and manifest["trustedLocalPackage"] and set(manifest["capabilities"])=={"editor-block","validator","renderer","assets"}
    def activate(candidate):
      required={"editor-block","validator","renderer","assets"}
      code=None
      if not isinstance(candidate.get("id"),str) or not candidate["id"]: code="PLUGIN_MANIFEST_ID_INVALID"
      elif not isinstance(candidate.get("version"),str) or not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?",candidate["version"]): code="PLUGIN_MANIFEST_VERSION_INVALID"
      elif any(part.isdigit() and len(part)>1 and part[0]=="0" for part in candidate["version"].split("+",1)[0].partition("-")[2].split(".") if part): code="PLUGIN_MANIFEST_VERSION_INVALID"
      elif candidate.get("trustedLocalPackage") is not True: code="PLUGIN_MANIFEST_TRUST_INVALID"
      elif candidate.get("hookContract")!="plugin-hooks/v1": code="PLUGIN_HOOK_CONTRACT_UNSUPPORTED"
      elif set(candidate.get("capabilities",[]))!=required: code="PLUGIN_CAPABILITIES_INVALID"
      return {"active":code is None,"diagnostic":None if code is None else {"code":code,"plugin":candidate.get("id","unknown"),"capability":"activation","entry":None,"remediation":"fix-manifest"}}
    invalid=[dict(manifest,hookContract="v0"),dict(manifest,version="1.x"),dict(manifest,version="1.2.3-01"),dict(manifest,trustedLocalPackage=False),dict(manifest,capabilities=["renderer"]),dict(manifest,id="")]
    activation=[activate(manifest),activate(dict(manifest,version="1.2.3-beta.1+build.1"))]+[activate(candidate) for candidate in invalid]+[activate(dict(manifest,version="01.2.3"))]
    assert activation[0]["active"] and activation[1]["active"] and all(not result["active"] and result["diagnostic"] for result in activation[2:])
    events.append({"case":"activation-validation","results":activation})
    hooks=[(20,"interactive-demo"),(10,"host-audit"),(20,"another-plugin")]
    hook_order=[plugin_id for _,plugin_id in sorted(hooks)]
    active_registry={manifest["id"]}; inactive_registry=set(); missing_registry=set()
    dispatch=lambda registry:[plugin_id for _,plugin_id in sorted(hooks) if plugin_id in registry]
    assert dispatch(active_registry)==["interactive-demo"] and dispatch(inactive_registry)==[] and dispatch(missing_registry)==[] and dispatch(active_registry)==["interactive-demo"]
    events.append({"case":"hook-lifecycle","active":dispatch(active_registry),"inactive":dispatch(inactive_registry),"missing":dispatch(missing_registry),"reenabled":dispatch(active_registry)})
    plugin_spec=importlib.util.spec_from_file_location("interactive_demo", ROOT/"spike-evidence/sp-a06/interactive-demo-plugin/plugin.py"); plugin=importlib.util.module_from_spec(plugin_spec); plugin_spec.loader.exec_module(plugin)
    class Services:
      def __init__(self): self.calls=[]
      def trace(self, capability): self.calls.append(capability)
      def sql(self): raise PermissionError("DIRECT_SQL_FORBIDDEN")
      def media(self): raise PermissionError("DIRECT_MEDIA_FORBIDDEN")
    demo={"html":"<button id=d>demo</button>","css":"#d{color:red}","js":"window.demo=1","fallback":"demo fallback"}
    def produce(selection, media):
      assert selection=="published" and resolved["media"]==media and resolved["routeGraphDigest"]
      claim=[claim for claim in resolved["claims"] if claim["owner"]=="note-1" and claim["revision"]=="pub"]
      if len(claim)!=1: raise ValueError("UNRESOLVED_PUBLISHED_ROUTE")
      asset_ids=["a1","a3"]; closure={item["id"] for item in media}
      if not set(asset_ids).issubset(closure): raise ValueError("UNRESOLVED_PUBLISHED_MEDIA")
      source={"contract":"renderer-input/v1","selection":{"publishedRevisionIds":["pub"],"routeGraphDigest":resolved["routeGraphDigest"],"mediaSelectionDigest":h(media)},"entries":[{"id":"note-pub","route":claim[0]["route"].strip("/")+"/","title":"Published","blocks":[{"kind":"image","assetIds":asset_ids},{"kind":"raw-article","html":"<button>raw</button>","fallback":"raw fallback"},{"kind":"plugin-demo","source":demo}]}],"routes":resolved["routes"],"media":[{"url":"media/"+item["id"],"bytes":item["bytes"].decode()} for item in media],"theme":{"id":"default","version":"1","hash":h("default-theme")},"plugins":[{"id":manifest["id"],"version":manifest["version"],"hash":h(manifest)}]}
      source["inputDigest"]=h(source); return b(source)
    def sandbox(source): return f"<iframe sandbox=\"allow-scripts\" srcdoc=\"{html.escape('<style>'+source['css']+'</style>'+source['html']+'<script>'+source['js']+'</script>')}\"></iframe><section>{source['fallback']}</section>"
    current={"marker":"DRAFT-ONLY-MARKER","source":demo}; public_bytes=produce("published",resolved["media"]); public=json.loads(public_bytes); assert current["marker"] not in public_bytes.decode()
    canonical_before=h({"current":current,"public":public_bytes.hex()})
    def preview(selection): return b({"sandbox":sandbox(current["source"] if selection=="current" else demo),"marker":current["marker"] if selection=="current" else None})
    assert b"DRAFT-ONLY-MARKER" in preview("current") and b"DRAFT-ONLY-MARKER" not in preview("published") and canonical_before==h({"current":current,"public":public_bytes.hex()})
    def build(input_bytes,out,active=True):
      projection=json.loads(input_bytes); payload=dict(projection); supplied=payload.pop("inputDigest"); assert projection["contract"]=="renderer-input/v1" and supplied==h(payload)
      services=Services()
      if active:
        plugin.validate(projection["entries"][0]["blocks"][2]["source"],services); rendered=plugin.render(projection["entries"][0]["blocks"][2]["source"],services); assets=plugin.assets(services)
        demo_html=sandbox(rendered)
        plugin_manifest=projection["plugins"]
      else:
        assert services.calls==[]; demo_html=""; assets={}; plugin_manifest=[]; inactive_diagnostic={"code":"PLUGIN_INACTIVE_OMITTED","plugin":manifest["id"],"capability":"renderer","entry":"note-pub"}
      for route in projection["routes"]:
        p=out/(route or "index.html"); p=(p/"index.html") if route else p; p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(f"<!doctype html><a href='{BASE}notes/intro/'>x</a><article><button>raw</button><section>raw fallback</section>{demo_html}</article>")
      (out/"media").mkdir(); [((out/item["url"]).write_bytes(item["bytes"].encode())) for item in projection["media"]]
      for name,data in assets.items(): (out/name).write_text(data)
      files={str(x.relative_to(out)):h(x.read_bytes()) for x in out.rglob('*') if x.is_file()}
      artifact={"inputDigest":supplied,"selection":projection["selection"],"theme":projection["theme"],"plugins":plugin_manifest,"files":files,"diagnostics":[] if active else [inactive_diagnostic]}; artifact["totalDigest"]=h(artifact); (out/"artifact-manifest.json").write_bytes(b(artifact))
      return artifact,services.calls
    root=Path(tempfile.mkdtemp()); one,two,inactive,redelivery=root/"one",root/"two",root/"inactive",root/"redelivery"
    a,calls=build(public_bytes,one); a2,calls2=build(public_bytes,two); assert a["totalDigest"]==a2["totalDigest"] and calls==calls2==["validator","renderer","assets"]
    text="".join(p.read_text() for p in one.rglob("*.html")); assert "raw fallback" in text and "sandbox=\"allow-scripts\"" in text and "DRAFT-ONLY-MARKER" not in text and str(root) not in text and (one/"media/a1").read_bytes()==b"old-media" and (one/"media/a3").read_bytes()==b"extra-media"
    ia,inactive_calls=build(public_bytes,inactive,False); inactive_text="".join(p.read_text() for p in inactive.rglob("*.html")); assert not inactive_calls and ia["plugins"]==[] and ia["diagnostics"][0]["code"]=="PLUGIN_INACTIVE_OMITTED" and "demo" not in inactive_text
    shutil.copytree(one,redelivery); assert {str(x.relative_to(one)):h(x.read_bytes()) for x in one.rglob('*') if x.is_file()}=={str(x.relative_to(redelivery)):h(x.read_bytes()) for x in redelivery.rglob('*') if x.is_file()}
    changed=json.loads(public_bytes); changed["theme"]["hash"]=h("changed"); changed.pop("inputDigest"); changed["inputDigest"]=h(changed); changed_artifact,_=build(b(changed),root/"changed"); assert changed_artifact["totalDigest"]!=a["totalDigest"]
    bad=Services(); diagnostic=None
    try: plugin.validate({"html":"bad"},bad)
    except ValueError as error: diagnostic={"code":"PLUGIN_VALIDATION_FAILED","plugin":manifest["id"],"capability":"validator","entry":"note-pub","cause":str(error),"remediation":"fix-source-or-deactivate"}
    assert diagnostic and diagnostic["cause"]=="DEMO_SOURCE_INCOMPLETE"
    events.append({"case":"projection-preview-delivery-plugin","input":public["inputDigest"],"producer_to_builder":True,"preview_read_only":True,"routes":public["routes"],"plugin_calls":calls,"inactive_calls":inactive_calls,"diagnostic":diagnostic,"artifact":a["totalDigest"],"redelivery":True,"provenance_change":True})
    shutil.rmtree(root)

def main():
 events=[]; schema_and_lifecycle(events); resolved=routes_and_media(events); projection_delivery_plugin(events,resolved); OUT.write_bytes(b({"contract":"CMS-BASIC-CONTRACTS-V1","events":events})+b"\n"); print("CONSENSUS CONTRACT PASS")
if __name__=='__main__':main()
