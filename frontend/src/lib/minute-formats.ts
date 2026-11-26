export type FieldKind = "text" | "paragraph" | "list" | "table" | "date" | "time" | "signature";
export type FormatField = { id: string; label: string; kind: FieldKind; required: boolean; hint: string };
export type MinuteFormat = { id: string; name: string; sector: string; description: string; fields: FormatField[] };
export const fieldLibrary: FormatField[] = [
  ["title","Meeting title","text",true,"Official name of the meeting"],
  ["reference","Meeting reference","text",false,"Unique minute or meeting number"],
  ["date","Date","date",true,"Meeting date"],
  ["venue","Venue / platform","text",true,"Physical or online location"],
  ["start","Opening time","time",false,"Time the meeting commenced"],
  ["chair","Chairperson","text",true,"Name and title"],
  ["secretary","Minute secretary","text",true,"Name and title"],
  ["attendance","Attendance","table",true,"Name, role and attendance status"],
  ["apologies","Apologies and absences","list",false,"Members not present"],
  ["quorum","Quorum and declarations","paragraph",false,"Quorum, conflicts of interest and disclosures"],
  ["agenda","Agenda","list",true,"Ordered items for consideration"],
  ["opening","Opening remarks","paragraph",false,"Welcome and opening communication"],
  ["previous","Confirmation of previous minutes","paragraph",false,"Approval or corrections"],
  ["arising","Matters arising","paragraph",false,"Follow-up from previous proceedings"],
  ["communications","Communications","paragraph",false,"Announcements and correspondence"],
  ["reports","Reports and presentations","paragraph",false,"Reports presented and discussed"],
  ["discussion","Proceedings by agenda item","paragraph",true,"Neutral account of substantive discussion"],
  ["reactions","Members’ contributions","paragraph",false,"Relevant contributions and concerns"],
  ["motions","Motions and voting","table",false,"Motion, proposer, seconder and outcome where recorded"],
  ["decisions","Resolutions and decisions","list",true,"Only decisions actually adopted"],
  ["actions","Action points","table",true,"Action, responsible person, due date and status"],
  ["risks","Risks and escalations","table",false,"Risk, mitigation and responsible person"],
  ["finance","Financial matters","paragraph",false,"Budget, expenditure and financial decisions"],
  ["compliance","Compliance and governance","paragraph",false,"Regulatory and policy matters"],
  ["quality","Quality and safety","paragraph",false,"Quality indicators, safety and improvements"],
  ["confidentiality","Confidentiality and restricted matters","paragraph",false,"Record only authorized, necessary information"],
  ["wayforward","Way forward","paragraph",false,"Agreed next steps"],
  ["aob","Any other business","paragraph",false,"Additional matters"],
  ["next","Next meeting","date",false,"Next meeting date, if agreed"],
  ["close","Closing time","time",false,"Time of adjournment"],
  ["approval","Approval and signatures","signature",false,"Secretary and chairperson"],
  ["attachments","Supporting documents","list",false,"References to attachments"]
].map(([id,label,kind,required,hint])=>({id:String(id),label:String(label),kind:kind as FieldKind,required:Boolean(required),hint:String(hint)}));
const head=["title","reference","date","venue","chair","secretary","attendance","apologies","agenda"];
const tail=["decisions","actions","wayforward","next","close","approval"];
function preset(id:string,name:string,sector:string,description:string,middle:string[],before:string[]=head,after:string[]=tail):MinuteFormat{
  return {id,name,sector,description,fields:[...before,...middle,...after].map(key=>({...fieldLibrary.find(f=>f.id===key)!}))};
}
export const formats:MinuteFormat[]=[
 preset("general","General meeting","General","A flexible formal meeting format.",["opening","previous","arising","communications","discussion","aob"]),
 preset("board","Board of directors","Corporate","Formal governance, resolutions and oversight.",["quorum","previous","arising","reports","finance","risks","discussion","motions","compliance"]),
 preset("management","Management meeting","Corporate","Operational performance and managerial decisions.",["opening","reports","discussion","finance","risks"]),
 preset("project","Project progress review","Project & technology","Milestones, delivery blockers and accountable actions.",["reports","discussion","risks","reactions"]),
 preset("standup","Team stand-up","Project & technology","A compact coordination and delivery format.",["reports","discussion","risks"],["title","date","attendance"],["actions","wayforward"]),
 preset("school","Staff meeting","Education","Staff coordination, academic and administrative matters.",["opening","previous","arising","communications","reports","discussion","aob"]),
 preset("school-board","School governing board","Education","Institutional governance, budgets and formal decisions.",["quorum","previous","arising","reports","finance","discussion","motions"]),
 preset("academic","Academic committee","Education","Curriculum, performance and academic quality.",["reports","quality","discussion","reactions"]),
 preset("government","Public sector departmental meeting","Government","Administrative proceedings, policy and service delivery.",["opening","previous","arising","communications","reports","discussion","compliance","finance"]),
 preset("council","Council / committee sitting","Government","Formal motions, deliberations and voting.",["quorum","previous","arising","communications","reports","discussion","motions","compliance"]),
 preset("hospital","Hospital management meeting","Healthcare","Operational coordination and healthcare service quality.",["opening","reports","quality","risks","discussion","finance"]),
 preset("clinical","Clinical governance / quality committee","Healthcare","Safety, quality and governance; avoid identifiable patient details.",["quorum","confidentiality","quality","reports","discussion","risks","compliance"]),
 preset("ngo","Programme review meeting","NGO & nonprofit","Programme results, donor commitments and implementation.",["reports","finance","discussion","risks","compliance"]),
 preset("community","Community consultation","Community","Stakeholder feedback and agreed next steps.",["opening","communications","discussion","reactions","aob"]),
 preset("association","Association / annual general meeting","Association & cooperative","Membership, financial reports and motions.",["quorum","previous","arising","reports","finance","discussion","motions"]),
 preset("research","Research committee","Research","Research progress, ethics and decisions.",["quorum","confidentiality","reports","compliance","discussion","risks"]),
 preset("faith","Faith-based organization meeting","Faith-based","Committee proceedings, reports and agreed actions.",["opening","previous","arising","communications","reports","discussion","finance"]),
 preset("emergency","Incident response / emergency coordination","Operations","Time-sensitive coordination, risks and decisions.",["reports","risks","discussion","communications"],["title","date","start","venue","chair","attendance"],["decisions","actions","wayforward","close"])
];
export const fieldKinds:FieldKind[]=["text","paragraph","list","table","date","time","signature"];
