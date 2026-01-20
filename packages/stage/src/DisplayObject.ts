export class DisplayObject
{
    protected static openfl_enable_experimental_update_queue: boolean = false;
    protected static openfl_dom: boolean = false;
    protected static __updateQueue: WeakSet<DisplayObject> = new WeakSet();

    protected __alpha: number = 1.0;
    // protected __blendMode: BlendMode = BlendMode.NORMAL;
    protected __cacheAsBitmap: boolean = false;
    // protected __cacheAsBitmapMatrix: Matrix = null;
    // protected __filters: BitmapFilter[] = null;
    protected __height: number = 0;
    // protected __loaderInfo: LoaderInfo | null = null;
    protected __mask: DisplayObject | null = null;
    protected __name: string | null = null;
    protected __opaqueBackground: number | null = null;
    protected __parent: DisplayObject | null = null;
    protected __renderDirty: boolean = false;
    protected __renderParent: DisplayObject | null = null;
    protected __root: DisplayObject | null = null;
    protected __rotation: number = 0;
    // protected __scroll9Grid: Rectangle = null;
    protected __scaleX: number = 0;
    protected __scaleY: number = 0;
    // protected __scrollRect: Rectangle = null;
    // protected __shader: Shader | null = null;
    // protected __stage: Stage | null = null;
    // protected __transform: Transform = new Transform();
    protected __updateQueueFlag: boolean = false;
    protected __width: number = 0;
    protected __visible: boolean = true;
    protected __x: number = 0;
    protected __y: number = 0;


    constructor()
    {

    }

    protected __setParentRenderDirty(): void
    {
        var renderParent = this.__renderParent != null ? this.__renderParent : this.__parent;
        if (renderParent != null && !renderParent.__renderDirty)
        {
            renderParent.__renderDirty = true;
            renderParent.__setParentRenderDirty();
        }
    }

    protected __setRenderDirty(): void
    {
        if (!this.__renderDirty)
        {
            this.__renderDirty = true;
            this.__setParentRenderDirty();
        }
        if (DisplayObject.openfl_enable_experimental_update_queue && !DisplayObject.openfl_dom)
        {
            this.__setUpdateQueueFlag();
        }
    }

    protected __setUpdateQueueFlag(add: boolean = true): void
    {
        if (add)
        {
            if (!this.__updateQueueFlag)
            {
                this.__updateQueueFlag = true;
                DisplayObject.__updateQueue.add(this);
            }
        }
        else
        {
            this.__updateQueueFlag = false;
            DisplayObject.__updateQueue.delete(this);
        }
    }

    // Getter & Setters
    get alpha(): number
    {
        return this.__alpha;
    }

    set alpha(value: number)
    {
        if (value > 1.0) value = 1.0;
        if (value < 0.0) value = 0.0;

        if (!this.__renderDirty && value != this.__alpha && !this.__cacheAsBitmap) 
        {
            this.__setRenderDirty();
        }
        this.__alpha = value;
    }

    // get blendMode(): BlendMode
    // {
    //     return this.__blendMode;
    // }

    // set blendMode(value: BlendMode)
    // {
    //     this.__blendMode = value;
    // }

    get cacheAsBitmap(): boolean
    {
        return this.__cacheAsBitmap;
    }

    set cacheAsBitmap(value: boolean)
    {
        this.__cacheAsBitmap = value;
    }

    // get cacheAsBitmapMatrix(): Matrix
    // {
    //     return this.__cacheAsBitmapMatrix;
    // }

    // set cacheAsBitmapMatrix(value: Matrix)
    // {
    //     this.__cacheAsBitmapMatrix = value;
    // }

    // get filters(): BitmapFilter[]
    // {
    //     return this.__filters;
    // }

    // set filters(value: BitmapFilter[])
    // {
    //     this.__filters = value;
    // }

    get height(): number
    {
        return this.__height;
    }

    set height(value: number)
    {
        this.__height = value;
    }

    // get loaderInfo(): LoaderInfo
    // {
    //     return this.__loaderInfo;
    // }

    get mask(): DisplayObject | null
    {
        return this.__mask;
    }

    set mask(value: DisplayObject | null)
    {
        this.__mask = value;
    }

    get mouseX(): number
    {
        return 0;
    }

    get mouseY(): number
    {
        return 0;
    }

    get name(): string | null
    {
        return this.__name;
    }

    set name(value: string | null)
    {
        this.__name = value;
    }

    get opaqueBackground(): number | null
    {
        return this.__opaqueBackground;
    }

    set opaqueBackground(value: number | null)
    {
        this.__opaqueBackground = value;
    }

    get parent(): DisplayObject | null
    {
        return this.__parent;
    }

    get root(): DisplayObject | null
    {
        return this.__root;
    }

    get rotation(): number
    {
        return this.__rotation;
    }

    set rotation(value: number)
    {
        this.__rotation = value;
    }

    // get scroll9Grid(): Rectangle | null
    // {
    //     return this.__scroll9Grid;
    // }

    // set scroll9Grid(value: Rectangle | null)
    // {
    //     this.__scroll9Grid = value;
    // }

    get scaleX(): number
    {
        return this.__scaleX;
    }

    set scaleX(value: number)
    {
        this.__scaleX = value;
    }

    get scaleY(): number
    {
        return this.__scaleY;
    }

    set scaleY(value: number)
    {
        this.__scaleY = value;
    }

    // get scrollRect(): Rectangle | null
    // {
    //     return this.__scrollRect;
    // }

    // set scrollRect(value: Rectangle | null)
    // {
    //     this.__scrollRect = value;
    // }

    // get shader(): Shader | null
    // {
    //     return this.__shader;
    // }

    // set shader(value: Shader | null)
    // {
    //     this.__shader = value;
    // }

    // get stage(): Stage | null
    // {
    //     return this.__stage;
    // }

    // get transform(): Transform
    // {
    //     return this.__transform;
    // }

    // set transform(value: Transform)
    // {
    //     this.__transform = value;
    // }

    get width(): number
    {
        return this.__width;
    }

    set width(value: number)
    {
        this.__width = value;
    }

    get visible(): boolean
    {
        return this.__visible;
    }

    set visible(value: boolean)
    {
        this.__visible = value;
    }

    get x(): number
    {
        return this.__x;
    }

    set x(value: number)
    {
        this.__x = value;
    }

    get y(): number
    {
        return this.__y;
    }

    set y(value: number)
    {
        this.__y = value;
    }
}

export default DisplayObject;