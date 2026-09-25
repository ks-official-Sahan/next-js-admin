type RecentPostProps = {
    id: string,
    title: string,
    date: string,
    description: string,
    category: string,
    image: string,
    tags: string[],  // array of strings
    readTime: string
}

type ColorObj = {
    light: {
        main: string;
        text: string;
    };
    dark: {
        main: string;
        text: string;
    }
}

type BlogCategoryCardProps = {
    id: number;
    name: string;
    selected: number;
    onClick: function;
    color: ColorObj;
    articleCount:number;
}