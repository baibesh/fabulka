import {
  DEFAULT_METHODOLOGIES,
  StorySchema,
  type ChildProfile,
} from '@fabulka/shared';
import { MockGateway } from './mock.gateway';
import {
  heroPrompt,
  methodPrompt,
  pagePrompt,
  prefillPrompt,
  reviewPrompt,
  storyPrompt,
  toyPrompt,
} from './prompts';

const method = (slug: string) =>
  DEFAULT_METHODOLOGIES.find((m) => m.slug === slug)!;

const brief = (overrides: Partial<ChildProfile> = {}, pageCount = 4) => ({
  child: { ...child, ...overrides },
  pageCount,
  methodology: method('growth-mindset'),
});

const child: ChildProfile = {
  name: 'Айгерим',
  age: 6,
  gender: 'girl' as const,
  interests: ['космос', 'лошади'],
  pet: 'кот Барсик',
  city: 'Алматы',
  language: 'ru' as const,
};

describe('MockGateway', () => {
  const gateway = new MockGateway(0);

  it('writes a valid story with the requested page count', async () => {
    const { story } = await gateway.writeStory(brief());
    expect(StorySchema.parse(story).pages).toHaveLength(4);
    expect(story.title).toContain('Айгерим');
  });

  it('writes in Kazakh when asked', async () => {
    const { story } = await gateway.writeStory(brief({ language: 'kk' }, 1));
    expect(story.title).toContain('сапар');
  });

  it('writes in English when asked', async () => {
    const { story } = await gateway.writeStory(brief({ language: 'en' }, 1));
    expect(story.title).toBe('Айгерим and the Starry Journey');
    expect(story.talk_questions[0]).toBe('What happened in the book?');
  });

  it('draws a distinct placeholder per page', async () => {
    const one = await gateway.drawPage('the hero, scene 1');
    const two = await gateway.drawPage('the hero, scene 2');
    expect(one.ext).toBe('svg');
    expect(one.data.equals(two.data)).toBe(false);
  });
});

describe('prompts', () => {
  it('puts every profile detail into the story prompt', () => {
    const prompt = storyPrompt(brief({}, 10));
    expect(storyPrompt(brief({ language: 'en' }))).toContain('in English');
    for (const part of [
      '10-page',
      'Russian',
      'Айгерим',
      'космос',
      'кот Барсик',
      'Алматы',
    ]) {
      expect(prompt).toContain(part);
    }
  });

  it('names the language in English, never by its own name', () => {
    const kazakh = storyPrompt(brief({ language: 'kk' }));
    expect(kazakh).toContain('in Kazakh.');
    expect(kazakh).not.toContain('Қазақша');
    expect(
      prefillPrompt({ transcript: 'x', language: 'kk', theme: false }),
    ).toContain('The parent speaks Kazakh.');
  });

  it('tells the safety review the book’s language and the child’s age', () => {
    const prompt = reviewPrompt('{"title":"Ертегі"}', 5, 'kk');
    expect(prompt).toContain("Child's age: 5.");
    expect(prompt).toContain('The story is in Kazakh.');
    expect(prompt).toContain('{"title":"Ертегі"}');
  });

  it('puts the method beats, the age norms and the theme into the story prompt', () => {
    const prompt = storyPrompt({
      ...brief({ age: 3 }),
      methodology: method('social-story'),
      theme: 'первый день в детском саду',
    });
    expect(prompt).toContain('Social Stories by Carol Gray');
    expect(prompt).toContain('step by step');
    expect(prompt).toContain('at most 25 words');
    expect(prompt).toContain('первый день в детском саду');
    expect(prompt).toContain('finish a sentence');
  });

  it('keeps pages within the words the layout has room for, never above the age norm', () => {
    const roomy = storyPrompt({ ...brief({ age: 9 }), wordsPerPage: 120 });
    expect(roomy).toContain('at most 100 words');
    expect(roomy).not.toContain('or it will not fit');
    const tight = storyPrompt({ ...brief({ age: 9 }), wordsPerPage: 60 });
    expect(tight).toContain('at most 60 words');
    expect(tight).toContain('keep every page within 60 words');
    expect(storyPrompt({ ...brief({ age: 3 }), wordsPerPage: 90 })).toContain(
      'at most 25 words',
    );
  });

  it('repeats the art style in hero and page prompts', () => {
    const none = { pet: false, toy: false };
    expect(heroPrompt('a girl')).toContain('watercolor');
    expect(pagePrompt('the hero in a park', none)).toContain('watercolor');
    expect(pagePrompt('the hero in a park', none)).not.toContain('pet');
    expect(pagePrompt('the hero in a park', none)).not.toContain('toy');
  });

  it('points a page only at the sheets of the companions in it', () => {
    const page = pagePrompt('the hero and the toy in a park', {
      pet: false,
      toy: true,
    });
    expect(page).toContain('toy character sheet');
    expect(page).not.toContain('pet character sheet');
    expect(pagePrompt('x', { pet: true, toy: false })).toContain(
      'pet character sheet',
    );
  });

  it('writes the method part from what the admin edited, leaving out empty lists', () => {
    const prompt = methodPrompt(
      {
        slug: 'calm-down',
        source: 'Mindfulness for children',
        structure: ['The hero is upset.', 'The hero breathes slowly.'],
        rules: [],
        avoid: ['shaming'],
      },
      6,
    );
    expect(prompt).toContain(
      'Story method: calm-down (Mindfulness for children). Beats, in order:\n- The hero is upset.\n- The hero breathes slowly.',
    );
    expect(prompt).not.toContain('Rules:');
    expect(prompt).toContain('Avoid: shaming.');
    expect(prompt).toContain('at most 60 words');
  });

  it('brings the toy into the story and draws it from the reference', () => {
    const prompt = storyPrompt({
      ...brief(),
      toy: { name: 'Бусинка', description: 'a plush bunny with a red scarf' },
    });
    expect(prompt).toContain(
      'Favourite toy, called "Бусинка": a plush bunny with a red scarf',
    );
    expect(toyPrompt('a plush bunny')).toContain('reference photo');
  });
});
