import { SupportKnowledgeService } from './support-knowledge.service';

describe('SupportKnowledgeService', () => {
  it('starts with an empty corpus until module init', () => {
    const service = new SupportKnowledgeService();
    expect(service.getKnowledgeCorpus()).toBe('');
  });
});
