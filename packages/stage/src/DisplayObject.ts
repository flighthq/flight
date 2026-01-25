import { Matrix } from '@flighthq/core';
import { Rectangle } from '@flighthq/core';

export default class DisplayObject
{
    protected __alpha: number = 1.0;
    // protected __blendMode: BlendMode = BlendMode.NORMAL;
    protected __cacheAsBitmap: boolean = false;
    protected __cacheAsBitmapMatrix: Matrix | null = null;
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
    protected __scale9Grid: Rectangle | null = null;
    protected __scaleX: number = 0;
    protected __scaleY: number = 0;
    protected __transform: any/*Matrix*/ = { tx: 0, ty: 0 };
    protected __transformDirty: boolean = false;
    protected __scrollRect: Rectangle | null = null;
    // protected __shader: Shader | null = null;
    // protected __stage: Stage | null = null;
    // protected __transform: Transform = new Transform();
    protected __width: number = 0;
    protected __visible: boolean = true;

    constructor()
    {

    }

    protected __setRenderDirty(): void
    {
        if (!this.__renderDirty)
        {
            this.__renderDirty = true;
            //this.__setParentRenderDirty();
        }

        // if (DisplayObject.openfl_enable_experimental_update_queue && !DisplayObject.openfl_dom)
        // {
        //     this.__setUpdateQueueFlag();
        // }
    }

    protected __setTransformDirty(): void
    {
        if (!this.__transformDirty)
        {
            this.__transformDirty = true;

            // this.__setWorldTransformInvalid();
            //this.__setParentRenderDirty();
        }

        // if (DisplayObject.openfl_enable_experimental_update_queue && !DisplayObject.openfl_dom)
        // {
        //     this.__setUpdateQueueFlag();
        // }
    }

    // protected __setUpdateQueueFlag(add: boolean = true): void
    // {
    //     if (add)
    //     {
    //         if (!this.__updateQueueFlag)
    //         {
    //             this.__updateQueueFlag = true;
    //             DisplayObject.__updateQueue.add(this);
    //         }
    //     }
    //     else
    //     {
    //         this.__updateQueueFlag = false;
    //         DisplayObject.__updateQueue.delete(this);
    //     }
    // }

    // Get & Set Methods

    get alpha(): number
    {
        return this.__alpha;
    }

    set alpha(value: number)
    {
        if (value > 1.0) value = 1.0;
        if (value < 0.0) value = 0.0;

        if (!this.__renderDirty && value !== this.__alpha && !this.__cacheAsBitmap) 
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
    //     if (value == null) value = NORMAL;

    // 	if (value != __blendMode) __setRenderDirty();
    // 	return __blendMode = value;
    // }

    get cacheAsBitmap(): boolean
    {
        // return (__filters == null ? __cacheAsBitmap : true);
        return this.__cacheAsBitmap;
    }

    set cacheAsBitmap(value: boolean)
    {
        if (!this.__renderDirty && value != this.__cacheAsBitmap)
        {
            this.__setRenderDirty();
        }

        this.__cacheAsBitmap = value;
    }

    get cacheAsBitmapMatrix(): Matrix | null
    {
        return this.__cacheAsBitmapMatrix;
    }

    set cacheAsBitmapMatrix(value: Matrix | null)
    {
        if (!this.__renderDirty && !Matrix.equals(value, this.__cacheAsBitmapMatrix))
        {
            this.__setRenderDirty();
        }
        this.__cacheAsBitmapMatrix = (value !== null ? Matrix.clone(value) : value);
    }

    // get filters(): BitmapFilter[]
    // {
    //     if (__filters == null)
    //     {
    //         return new Array();
    //     }
    //     else
    //     {
    //         return __filters.copy();
    //     }
    // }

    // set filters(value: BitmapFilter[])
    // {
    //     if (value != null && value.length > 0)
    //     {
    //         var clonedFilters:Array<BitmapFilter> = [];

    //         for (filter in value)
    //         {
    //             var clonedFilter:BitmapFilter = filter.clone();

    //             clonedFilter.__renderDirty = true;
    //             clonedFilters.push(clonedFilter);
    //         }

    //         __filters = clonedFilters;
    //         // __updateFilters = true;
    //         __setRenderDirty();
    //     }
    //     else if (__filters != null)
    //     {
    //         __filters = null;
    //         // __updateFilters = false;
    //         __setRenderDirty();
    //     }

    //     return value;
    // }

    get height(): number
    {
        // var rect = Rectangle.__pool.get();
        // __getLocalBounds(rect);
        // var height = rect.height;
        // Rectangle.__pool.release(rect);
        // return height;
        return this.__height;
    }

    set height(value: number)
    {
        // var rect = Rectangle.__pool.get();
        // var matrix = Matrix.__pool.get();
        // matrix.identity();

        // __getBounds(rect, matrix);

        // if (value != rect.height)
        // {
        //     scaleY = value / rect.height;
        // }
        // else
        // {
        //     scaleY = 1;
        // }

        // Rectangle.__pool.release(rect);
        // Matrix.__pool.release(matrix);

        // return value;
        this.__height = value;
    }

    // get loaderInfo(): LoaderInfo
    // {
    //     if (stage != null)
    //     {
    //         return Lib.current.__loaderInfo;
    //     }

    //     return null;
    //     return this.__loaderInfo;
    // }

    get mask(): DisplayObject | null
    {
        return this.__mask;
    }

    set mask(value: DisplayObject | null)
    {
        // if (value == __mask)
        // {
        //     return value;
        // }

        // if (value != __mask)
        // {
        //     __setTransformDirty();
        //     __setRenderDirty();
        // }

        // if (__mask != null)
        // {
        //     __mask.__isMask = false;
        //     __mask.__maskTarget = null;
        //     __mask.__setTransformDirty();
        //     __mask.__setRenderDirty();
        // }

        // if (value != null)
        // {
        //     value.__isMask = true;
        //     value.__maskTarget = this;
        //     value.__setWorldTransformInvalid();
        // }

        // if (__cacheBitmap != null && __cacheBitmap.mask != value)
        // {
        //     __cacheBitmap.mask = value;
        // }

        // return __mask = value;
        this.__mask = value;
    }

    get mouseX(): number
    {
        // var mouseX = (stage != null ? stage.__mouseX : Lib.current.stage.__mouseX);
        // var mouseY = (stage != null ? stage.__mouseY : Lib.current.stage.__mouseY);

        // return __getRenderTransform().__transformInverseX(mouseX, mouseY);
        return 0;
    }

    get mouseY(): number
    {
        // var mouseX = (stage != null ? stage.__mouseX : Lib.current.stage.__mouseX);
        // var mouseY = (stage != null ? stage.__mouseY : Lib.current.stage.__mouseY);

        // return __getRenderTransform().__transformInverseY(mouseX, mouseY);
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
        // if (stage != null)
        // {
        //     return Lib.current;
        // }
        return this.__root;
    }

    get rotation(): number
    {
        return this.__rotation;
    }

    set rotation(value: number)
    {
        // if (value != __rotation)
        // {
        //     value = value % 360.0;
        //     if (value > 180.0)
        //     {
        //         value -= 360.0;
        //     }
        //     else if (value < -180.0)
        //     {
        //         value += 360.0;
        //     }

        //     __rotation = value;
        //     var radians = __rotation * (Math.PI / 180);
        //     __rotationSine = Math.sin(radians);
        //     __rotationCosine = Math.cos(radians);

        //     __transform.a = __rotationCosine * __scaleX;
        //     __transform.b = __rotationSine * __scaleX;
        //     __transform.c = -__rotationSine * __scaleY;
        //     __transform.d = __rotationCosine * __scaleY;

        //     __setTransformDirty();
        // }

        // return value;
        this.__rotation = value;
    }

    get scale9Grid(): Rectangle | null
    {
        // if (__scale9Grid == null)
        // {
        //     return null;
        // }

        // return __scale9Grid.clone();
        return this.__scale9Grid;
    }

    set scroll9Grid(value: Rectangle | null)
    {
        // if (value == null && __scale9Grid == null) return value;
        // if (value != null && __scale9Grid != null && __scale9Grid.equals(value)) return value;

        // if (value != null)
        // {
        //     if (__scale9Grid == null) __scale9Grid = new Rectangle();
        //     __scale9Grid.copyFrom(value);
        // }
        // else
        // {
        //     __scale9Grid = null;
        // }

        // __setRenderDirty();

        // return value;
        this.__scale9Grid = value;
    }

    get scaleX(): number
    {
        return this.__scaleX;
    }

    set scaleX(value: number)
    {
        // if (value != __scaleX)
        // {
        //     __scaleX = value;

        //     if (__transform.b == 0)
        //     {
        //         if (value != __transform.a) __setTransformDirty();
        //         __transform.a = value;
        //     }
        //     else
        //     {
        //         var a = __rotationCosine * value;
        //         var b = __rotationSine * value;

        //         if (__transform.a != a || __transform.b != b)
        //         {
        //             __setTransformDirty();
        //         }

        //         __transform.a = a;
        //         __transform.b = b;
        //     }
        // }
        this.__scaleX = value;
    }

    get scaleY(): number
    {
        return this.__scaleY;
    }

    set scaleY(value: number)
    {
        // if (value != __scaleY)
        // {
        //     __scaleY = value;

        //     if (__transform.c == 0)
        //     {
        //         if (value != __transform.d) __setTransformDirty();
        //         __transform.d = value;
        //     }
        //     else
        //     {
        //         var c = -__rotationSine * value;
        //         var d = __rotationCosine * value;

        //         if (__transform.d != d || __transform.c != c)
        //         {
        //             __setTransformDirty();
        //         }

        //         __transform.c = c;
        //         __transform.d = d;
        //     }
        // }
        this.__scaleY = value;
    }

    get scrollRect(): Rectangle | null
    {
        // if (__scrollRect == null)
        // {
        //     return null;
        // }

        // return __scrollRect.clone();
        return this.__scrollRect;
    }

    set scrollRect(value: Rectangle | null)
    {
        // if (value == null && __scrollRect == null) return value;
        // if (value != null && __scrollRect != null && __scrollRect.equals(value)) return value;

        // if (value != null)
        // {
        //     if (__scrollRect == null) __scrollRect = new Rectangle();
        //     __scrollRect.copyFrom(value);
        // }
        // else
        // {
        //     __scrollRect = null;
        // }

        // __setTransformDirty();

        // if (__supportDOM)
        // {
        //     __setRenderDirty();
        // }
        this.__scrollRect = value;
    }

    // get shader(): Shader | null
    // {
    //     return this.__shader;
    // }

    // set shader(value: Shader | null)
    // {
    //     __shader = value;
    //     __setRenderDirty();
    //     this.__shader = value;
    // }

    // get stage(): Stage | null
    // {
    //     return this.__stage;
    // }

    // get transform(): Transform
    // {
    //     if (__objectTransform == null)
    //     {
    //         __objectTransform = new Transform(this);
    //     }

    //     return __objectTransform;
    //     return this.__transform;
    // }

    // set transform(value: Transform)
    // {
    //     if (value == null)
    //     {
    //         throw new TypeError("Parameter transform must be non-null.");
    //     }

    //     if (__objectTransform == null)
    //     {
    //         __objectTransform = new Transform(this);
    //     }

    //     __setTransformDirty();

    //     if (value.__hasMatrix)
    //     {
    //         var other = value.__displayObject.__transform;
    //         __objectTransform.__setTransform(other.a, other.b, other.c, other.d, other.tx, other.ty);
    //     }
    //     else
    //     {
    //         __objectTransform.__hasMatrix = false;
    //     }

    //     if (!__objectTransform.__colorTransform.__equals(value.__colorTransform, true)
    //         || (!cacheAsBitmap && __objectTransform.__colorTransform.alphaMultiplier != value.__colorTransform.alphaMultiplier))
    //     {
    //         __objectTransform.__colorTransform.__copyFrom(value.colorTransform);
    //         __setRenderDirty();
    //     }
    // }

    get visible(): boolean
    {
        return this.__visible;
    }

    set visible(value: boolean)
    {
        if (!this.__renderDirty && value !== this.__visible)
        {
            this.__setRenderDirty();
        }
        this.__visible = value;
    }

    get width(): number
    {
        // var rect = Rectangle.__pool.get();
        // __getLocalBounds(rect);
        // var width = rect.width;
        // Rectangle.__pool.release(rect);
        // return width;
        return this.__width;
    }

    set width(value: number)
    {
        // var rect = Rectangle.__pool.get();
        // var matrix = Matrix.__pool.get();
        // matrix.identity();

        // this.__getBounds(rect, matrix);

        // if (value != rect.width)
        // {
        // 	this.scaleX = value / rect.width;
        // }
        // else
        // {
        // 	this.scaleX = 1;
        // }

        // Rectangle.__pool.release(rect);
        // Matrix.__pool.release(matrix);
    }

    get x(): number
    {
        return this.__transform.tx;
    }

    set x(value: number)
    {
        if (value !== value) value = 0.0; // Flash converts NaN to 0.0
        if (!this.__transformDirty && value !== this.__transform.tx)
        {
            this.__setTransformDirty();
        }
        this.__transform.tx = value;
    }

    get y(): number
    {
        return this.__transform.ty;
    }

    set y(value: number)
    {
        if (value !== value) value = 0.0; // Flash converts NaN to 0.0
        if (!this.__transformDirty && value !== this.__transform.ty)
        {
            this.__setTransformDirty();
        }
        this.__transform.ty = value;
    }
}