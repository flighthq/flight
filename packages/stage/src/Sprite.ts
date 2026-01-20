export class Sprite
{
    x: number = 0;
    y: number = 0;

    constructor()
    {

    }
}

export function create()
{
    return new Sprite();
}

export default Sprite;