import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

@Injectable()
export class SupportKnowledgeService implements OnModuleInit {
  private knowledge = '';

  onModuleInit(): void {
    this.knowledge = this.loadKnowledgeFiles();
  }

  getKnowledgeCorpus(): string {
    return this.knowledge;
  }

  private loadKnowledgeFiles(): string {
    const knowledgeDir = join(__dirname, '..', 'knowledge');
    let files: string[];

    try {
      files = readdirSync(knowledgeDir).filter((name) => name.endsWith('.md'));
    } catch {
      return '';
    }

    return files
      .sort()
      .map((fileName) => {
        const content = readFileSync(join(knowledgeDir, fileName), 'utf8');
        return `## ${fileName}\n\n${content.trim()}`;
      })
      .join('\n\n---\n\n');
  }
}
