// Fictional portfolio for isolated tests; never copy a real user's projects here.
import {facts} from './target-length-fixtures.mjs';
export const workflows=[
 {text:'我借助AI搭建过合同字段核对示例，将条款提取和版本差异整理串成流程，模拟整理耗时由约17小时降至约6小时。',matchTerms:['合同','条款','修订']},
 {text:'我借助AI设计并搭建了客户资料汇总示例，关联公司档案和合作事项，支持缺项检查与资料来源追溯，保留人工确认。',matchTerms:['客户档案','合作方','资料汇总']},
 {text:'我用AI搭建了询价比较示例，关联采购需求与多家报价，统一费用和交期比较口径，方便人工核对及确认选择。',matchTerms:['采购','询价','报价','交期']},
 {text:'我借助AI搭建了产品物料管理示例，关联上线图片、说明文档和版本记录，支持缺件检查及交付确认，便于跨部门跟进。',matchTerms:['上线','物料','图片','交付']},
 {text:'我能借助AI把重复的资料工作拆解成可复用流程，已搭建多个办公流程示例，注重信息关联、记录追溯与人工确认。',matchTerms:[],fallback:true},
];
export const personalProfile={intro:'我有业务支持经验。',profile:facts.join('\n'),experience:'三年工作经验',aiWorkflows:workflows};
